package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncResponse;
import java.lang.reflect.Field;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
class SyncMultiPageIT {

    @SuppressWarnings("resource")
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired
    private SyncService syncService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    private String guestUserId;
    private String deviceId;

    @BeforeEach
    void setUp() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
        guestUserId = "guest-" + System.currentTimeMillis();
        deviceId = "device-" + System.currentTimeMillis();
    }

    @Test
    void syncFetchesAllDeltasAcrossMultiplePages_withoutSkippingOrDuplicates() {
        int limit = deltaLimit();
        int seedCount = limit * 2 + 500;
        seedChangeLog(seedCount);

        SyncResponse page1 = syncService.sync(deviceId, guestUserId, "0", List.of());
        SyncResponse page2 = syncService.sync(deviceId, guestUserId, page1.getCursor(), List.of());
        SyncResponse page3 = syncService.sync(deviceId, guestUserId, page2.getCursor(), List.of());

        assertThat(page1.getDeltas()).hasSize(limit);
        assertThat(page1.getHasMore()).isTrue();
        assertThat(page2.getDeltas()).hasSize(limit);
        assertThat(page2.getHasMore()).isTrue();
        assertThat(page3.getDeltas()).hasSize(seedCount - (2 * limit));
        assertThat(page3.getHasMore()).isFalse();

        List<Long> page1Ids = changeIds(page1);
        List<Long> page2Ids = changeIds(page2);
        List<Long> page3Ids = changeIds(page3);

        long page1Max = page1Ids.get(page1Ids.size() - 1);
        long page2Min = page2Ids.get(0);
        long page2Max = page2Ids.get(page2Ids.size() - 1);
        long page3Min = page3Ids.get(0);
        long page3Max = page3Ids.get(page3Ids.size() - 1);

        assertThat(page1Max).isLessThan(page2Min);
        assertThat(page2Max).isLessThan(page3Min);

        assertThat(Long.parseLong(page1.getCursor())).isEqualTo(page1Max);
        assertThat(Long.parseLong(page2.getCursor())).isEqualTo(page2Max);
        assertThat(Long.parseLong(page3.getCursor())).isEqualTo(page3Max);
        assertThat(Long.parseLong(page1.getCursor())).isLessThan(Long.parseLong(page2.getCursor()));
        assertThat(Long.parseLong(page2.getCursor())).isLessThan(Long.parseLong(page3.getCursor()));

        Set<Long> allIds = new HashSet<>();
        allIds.addAll(page1Ids);
        allIds.addAll(page2Ids);
        allIds.addAll(page3Ids);
        assertThat(allIds).hasSize(seedCount);
    }

    private void seedChangeLog(int count) {
        String sql = """
                INSERT INTO change_log (guest_user_id, entity_type, entity_id, op_type, row_json)
                VALUES (?, ?, ?, ?, ?::jsonb)
                """;
        for (int i = 1; i <= count; i += 1) {
            jdbcTemplate.update(
                    sql,
                    guestUserId,
                    "program",
                    "program-" + i,
                    "upsert",
                    "{\"id\":\"program-" + i + "\"}");
        }
    }

    private List<Long> changeIds(SyncResponse response) {
        return response.getDeltas().stream()
                .map(SyncDelta::changeId)
                .toList();
    }

    private int deltaLimit() {
        try {
            Field field = SyncService.class.getDeclaredField("DELTA_LIMIT");
            field.setAccessible(true);
            return field.getInt(null);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to read delta limit", ex);
        }
    }
}