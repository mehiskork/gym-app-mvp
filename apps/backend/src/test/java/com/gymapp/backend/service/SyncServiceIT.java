package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.model.SyncDelta;
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
    void freshSyncReturnsSnapshotCursorFromHighWater_whenWithinLimit() {
        insertChanges(3);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas()).hasSize(3);
        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getCursor()).isEqualTo(String.valueOf(maxChangeId()));
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly("program-1", "program-2", "program-3");
    }

    @Test
    void freshSyncReturnsSnapshotCursorAndLimitsDeltas_whenLimitPlusOne() {
        int limit = deltaLimit();
        insertChanges(limit + 1);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getHasMore()).isTrue();
        assertThat(response.getDeltas()).hasSize(limit);
        assertThat(response.getCursor()).startsWith("snapshot:" + maxChangeId() + ":program:");
        assertThat(response.getDeltas())
                .extracting(SyncDelta::changeId)
                .containsOnly(maxChangeId());
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
        Instant now = Instant.now();
        syncRepository.upsertEntityState(guestUserId, "program", "program-owned", Map.of("id", "program-owned"),
                now);
        syncRepository.insertChangeLog(guestUserId, "program", "program-owned", "upsert", Map.of("name", "Owned"));
        syncRepository.upsertEntityState("guest-other", "program", "program-other", Map.of("id", "program-other"),
                now);
        syncRepository.insertChangeLog("guest-other", "program", "program-other", "upsert", Map.of("name", "Other"));

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(delta -> delta.entityId())
                .containsExactly("program-owned");
    }

    @Test
    void freshSyncReturnsCurrentSnapshotInsteadOfHistoricalReorderDeltas() {
        String dayId = "day-reorder";
        String firstExerciseId = "day_ex_a";
        String secondExerciseId = "day_ex_b";

        insertChangeLog("program_day_exercise", firstExerciseId, Map.of(
                "id", firstExerciseId,
                "program_day_id", dayId,
                "position", 1));
        insertChangeLog("program_day_exercise", secondExerciseId, Map.of(
                "id", secondExerciseId,
                "program_day_id", dayId,
                "position", 2));
        insertChangeLog("program_day_exercise", secondExerciseId, Map.of(
                "id", secondExerciseId,
                "program_day_id", dayId,
                "position", 1));
        insertChangeLog("program_day_exercise", firstExerciseId, Map.of(
                "id", firstExerciseId,
                "program_day_id", dayId,
                "position", 2));

        Instant now = Instant.now();
        syncRepository.upsertEntityState(guestUserId, "program_day_exercise", firstExerciseId, Map.of(
                "id", firstExerciseId,
                "program_day_id", dayId,
                "position", 2), now);
        syncRepository.upsertEntityState(guestUserId, "program_day_exercise", secondExerciseId, Map.of(
                "id", secondExerciseId,
                "program_day_id", dayId,
                "position", 1), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas()).hasSize(2);
        assertThat(response.getCursor()).isEqualTo(String.valueOf(maxChangeId()));
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly(firstExerciseId, secondExerciseId);
        assertThat(response.getDeltas())
                .extracting(delta -> delta.payload().get("position"))
                .containsExactly(2, 1);
        assertThat(response.getDeltas())
                .extracting(delta -> delta.payload().get("position"))
                .doesNotHaveDuplicates();

        SyncResponse nextResponse = syncService.sync(deviceId, guestUserId, response.getCursor(), List.of());
        assertThat(nextResponse.getDeltas()).isEmpty();
        assertThat(nextResponse.getCursor()).isEqualTo(response.getCursor());
    }

    @Test
    void numericCursorGreaterThanZeroKeepsIncrementalChangeLogBehavior() {
        insertChangeLog("program", "program-old", Map.of("id", "program-old"));
        long cursor = maxChangeId();
        insertChangeLog("program", "program-new-1", Map.of("id", "program-new-1"));
        insertChangeLog("program", "program-new-2", Map.of("id", "program-new-2"));

        SyncResponse response = syncService.sync(deviceId, guestUserId, String.valueOf(cursor), List.of());

        assertThat(response.getHasMore()).isFalse();
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly("program-new-1", "program-new-2");
        assertThat(response.getCursor()).isEqualTo(String.valueOf(maxChangeId()));
    }

    @Test
    void freshSnapshotIncludesWorkoutHistoryEntitiesInDependencyOrder() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("workout_set", "set-1", Map.of(
                "id", "set-1",
                "workout_session_exercise_id", "session-exercise-1",
                "set_index", 0), now);
        upsertEntityStateAndChangeLog("workout_session_exercise", "session-exercise-1", Map.of(
                "id", "session-exercise-1",
                "workout_session_id", "session-1",
                "position", 0), now);
        upsertEntityStateAndChangeLog("workout_session", "session-1", Map.of(
                "id", "session-1",
                "status", "completed"), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly("workout_session", "workout_session_exercise", "workout_set");
    }

    private void insertChanges(int count) {
        Instant now = Instant.now();
        for (int i = 1; i <= count; i += 1) {
            upsertEntityStateAndChangeLog("program", "program-" + i,
                    Map.of("id", "program-" + i, "name", "Program " + i), now);
        }
    }

    private void upsertEntityStateAndChangeLog(String entityType, String entityId, Map<String, Object> payload,
            Instant receivedAt) {
        syncRepository.upsertEntityState(guestUserId, entityType, entityId, payload, receivedAt);
        insertChangeLog(entityType, entityId, payload);
    }

    private void insertChangeLog(String entityType, String entityId, Map<String, Object> payload) {
        syncRepository.insertChangeLog(guestUserId, entityType, entityId, "upsert", payload);
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
