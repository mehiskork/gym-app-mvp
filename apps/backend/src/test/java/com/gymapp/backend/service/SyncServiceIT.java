package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
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
class SyncServiceIT {

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
    private SyncRepository syncRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestUserId;
    private String deviceId;

    @BeforeEach
    void setUp() {
        guestUserId = "guest-" + System.currentTimeMillis();
        deviceId = "device-" + System.currentTimeMillis();
        deviceRepository.insertDevice(deviceId, "secret-hash", guestUserId);
    }

    @Test
    void syncReturnsCursorFromLastDelta_whenWithinLimit() {
        insertChanges(3);

        SyncResponse response = syncService.sync(deviceId, "0", List.of());

        assertThat(response.getDeltas()).hasSize(3);
        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getCursor())
                .isEqualTo(String.valueOf(response.getDeltas().get(response.getDeltas().size() - 1).changeId()));
    }

    @Test
    void syncReturnsHasMoreTrueAndLimitsDeltas_whenLimitPlusOne() {
        int limit = deltaLimit();
        insertChanges(limit + 1);

        SyncResponse response = syncService.sync(deviceId, "0", List.of());

        assertThat(response.getHasMore()).isTrue();
        assertThat(response.getDeltas()).hasSize(limit);
        long responseCursor = Long.parseLong(response.getCursor());
        assertThat(responseCursor)
                .isEqualTo(response.getDeltas().get(response.getDeltas().size() - 1).changeId());

        Long maxChangeId = jdbcTemplate.queryForObject(
                "SELECT MAX(change_id) FROM change_log WHERE guest_user_id = ?",
                Long.class,
                guestUserId);
        assertThat(maxChangeId).isNotNull();
        assertThat(maxChangeId).isGreaterThan(responseCursor);
    }

    @Test
    void syncReturnsCursorUnchanged_whenNoDeltas() {
        SyncResponse response = syncService.sync(deviceId, "42", List.of());

        assertThat(response.getDeltas()).isEmpty();
        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getCursor()).isEqualTo("42");
    }

    private void insertChanges(int count) {
        for (int i = 1; i <= count; i += 1) {
            syncRepository.insertChangeLog(
                    guestUserId,
                    "program",
                    "program-" + i,
                    "upsert",
                    Map.of("name", "Program " + i));
        }
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