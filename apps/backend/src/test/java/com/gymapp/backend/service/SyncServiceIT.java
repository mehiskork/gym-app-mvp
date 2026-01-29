package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.SyncRepository;
import java.time.Instant;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
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
    void syncReturnsCursorFromLastDelta_whenWithinLimit() {
        insertChanges(3);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas()).hasSize(3);
        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getCursor())
                .isEqualTo(String.valueOf(response.getDeltas().get(response.getDeltas().size() - 1).changeId()));
    }

    @Test
    void syncReturnsHasMoreTrueAndLimitsDeltas_whenLimitPlusOne() {
        int limit = deltaLimit();
        insertChanges(limit + 1);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

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
        SyncResponse response = syncService.sync(deviceId, guestUserId, "42", List.of());

        assertThat(response.getDeltas()).isEmpty();
        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getCursor()).isEqualTo("42");
    }

    @Test
    void syncRejectsWriteWhenEntityOwnedByAnotherGuest() {
        String otherGuestUserId = "guest-other-" + System.currentTimeMillis();
        Instant now = Instant.now();
        syncRepository.upsertEntityState(
                otherGuestUserId,
                "program",
                "program-foreign",
                Map.of("id", "program-foreign"),
                now);

        SyncOp op = new SyncOp(
                "op-foreign",
                "program",
                "program-foreign",
                "upsert",
                Map.of("id", "program-foreign"),
                null);

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(ForbiddenException.class)
                .satisfies(ex -> assertThat(((ForbiddenException) ex).getCode()).isEqualTo("SYNC_FORBIDDEN"));
    }

    @Test
    void syncReturnsOnlyAuthenticatedGuestDeltas() {
        syncRepository.insertChangeLog(
                guestUserId,
                "program",
                "program-owned",
                "upsert",
                Map.of("name", "Owned"));
        syncRepository.insertChangeLog(
                "guest-other",
                "program",
                "program-other",
                "upsert",
                Map.of("name", "Other"));

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(delta -> delta.entityId())
                .containsExactly("program-owned");
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