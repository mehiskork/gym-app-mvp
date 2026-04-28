package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncResponse;
import java.sql.Timestamp;
import java.time.Instant;
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
        seedEntityStateAndChangeLog(seedCount);

        SyncResponse page1 = syncService.sync(deviceId, guestUserId, "0", List.of());
        SyncResponse page2 = syncService.sync(deviceId, guestUserId, page1.getCursor(), List.of());
        SyncResponse page3 = syncService.sync(deviceId, guestUserId, page2.getCursor(), List.of());

        assertThat(page1.getDeltas()).hasSize(limit);
        assertThat(page1.getHasMore()).isTrue();
        assertThat(page2.getDeltas()).hasSize(limit);
        assertThat(page2.getHasMore()).isTrue();
        assertThat(page3.getDeltas()).hasSize(seedCount - (2 * limit));
        assertThat(page3.getHasMore()).isFalse();

        long highWater = maxChangeId();
        assertThat(page1.getCursor()).startsWith("snapshot:" + highWater + ":program:");
        assertThat(page2.getCursor()).startsWith("snapshot:" + highWater + ":program:");
        assertThat(page3.getCursor()).isEqualTo(String.valueOf(highWater));
        assertThat(changeIds(page1)).containsOnly(highWater);
        assertThat(changeIds(page2)).containsOnly(highWater);
        assertThat(changeIds(page3)).containsOnly(highWater);

        Set<String> allEntityIds = new HashSet<>();
        allEntityIds.addAll(entityIds(page1));
        allEntityIds.addAll(entityIds(page2));
        allEntityIds.addAll(entityIds(page3));
        assertThat(allEntityIds).hasSize(seedCount);
    }

    @Test
    void snapshotPagingDoesNotSendChildLayerBeforeParentLayer() {
        int limit = deltaLimit();
        seedEntityStateAndChangeLog(limit + 1);
        insertEntityStateAndChangeLog(
                "program_week",
                "week-after-programs",
                "{\"id\":\"week-after-programs\",\"program_id\":\"program-1\",\"week_index\":0}");

        SyncResponse page1 = syncService.sync(deviceId, guestUserId, "0", List.of());
        SyncResponse page2 = syncService.sync(deviceId, guestUserId, page1.getCursor(), List.of());

        long highWater = maxChangeId();
        assertThat(page1.getDeltas()).hasSize(limit);
        assertThat(page1.getHasMore()).isTrue();
        assertThat(page1.getCursor()).startsWith("snapshot:" + highWater + ":program:");
        assertThat(page1.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsOnly("program");

        assertThat(page2.getHasMore()).isFalse();
        assertThat(page2.getCursor()).isEqualTo(String.valueOf(highWater));
        assertThat(page2.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly("program", "program_week");
        assertThat(page2.getDeltas())
                .extracting(SyncDelta::entityId)
                .contains("week-after-programs");
    }

    private void seedEntityStateAndChangeLog(int count) {
        Instant now = Instant.now();
        for (int i = 1; i <= count; i += 1) {
            insertEntityStateAndChangeLog("program", "program-" + i, "{\"id\":\"program-" + i + "\"}", now);
        }
    }

    private void insertEntityStateAndChangeLog(String entityType, String entityId, String payloadJson) {
        insertEntityStateAndChangeLog(entityType, entityId, payloadJson, Instant.now());
    }

    private void insertEntityStateAndChangeLog(String entityType, String entityId, String payloadJson, Instant now) {
        jdbcTemplate.update(
                """
                        INSERT INTO entity_state (guest_user_id, entity_type, entity_id, row_json, last_received_at)
                        VALUES (?, ?, ?, ?::jsonb, ?)
                        """,
                guestUserId,
                entityType,
                entityId,
                payloadJson,
                Timestamp.from(now));
        jdbcTemplate.update(
                """
                        INSERT INTO change_log (guest_user_id, entity_type, entity_id, op_type, row_json)
                        VALUES (?, ?, ?, ?, ?::jsonb)
                        """,
                guestUserId,
                entityType,
                entityId,
                "upsert",
                payloadJson);
    }

    private List<Long> changeIds(SyncResponse response) {
        return response.getDeltas().stream()
                .map(SyncDelta::changeId)
                .toList();
    }

    private List<String> entityIds(SyncResponse response) {
        return response.getDeltas().stream()
                .map(SyncDelta::entityId)
                .toList();
    }

    private long maxChangeId() {
        Long maxChangeId = jdbcTemplate.queryForObject(
                "SELECT MAX(change_id) FROM change_log WHERE guest_user_id = ?",
                Long.class,
                guestUserId);
        assertThat(maxChangeId).isNotNull();
        return maxChangeId;
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
