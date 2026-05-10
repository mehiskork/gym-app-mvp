package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
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
    void syncAcceptsChildWhenRequiredParentExistsActiveForSameOwner() {
        Instant now = Instant.now();
        syncRepository.upsertEntityState(guestUserId, "program", "program-parent", Map.of(
                "id", "program-parent",
                "updated_at", "2026-03-01T00:00:00Z"), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(upsertOp(
                "op-week-existing-parent",
                "program_week",
                "week-existing-parent",
                Map.of(
                        "id", "week-existing-parent",
                        "program_id", "program-parent",
                        "updated_at", "2026-03-01T00:01:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsExactly("applied");
        assertThat(countEntityStateRows(guestUserId, "program_week", "week-existing-parent")).isEqualTo(1);
    }

    @Test
    void syncAcceptsChildWhenParentAppearsEarlierInSameRequestAndApplies() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(
                upsertOp("op-program-parent-first", "program", "program-parent-first", Map.of(
                        "id", "program-parent-first",
                        "updated_at", "2026-03-01T00:00:00Z")),
                upsertOp("op-week-parent-first", "program_week", "week-parent-first", Map.of(
                        "id", "week-parent-first",
                        "program_id", "program-parent-first",
                        "updated_at", "2026-03-01T00:01:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsExactly("applied", "applied");
        assertThat(countEntityStateRows(guestUserId, "program_week", "week-parent-first")).isEqualTo(1);
    }

    @Test
    void syncAcceptsChildWhenParentAppearsLaterInRequestButAppliesFirstByDependencyOrder() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(
                upsertOp("op-week-parent-later", "program_week", "week-parent-later", Map.of(
                        "id", "week-parent-later",
                        "program_id", "program-parent-later",
                        "updated_at", "2026-03-01T00:01:00Z")),
                upsertOp("op-program-parent-later", "program", "program-parent-later", Map.of(
                        "id", "program-parent-later",
                        "updated_at", "2026-03-01T00:00:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::opId)
                .containsExactly("op-week-parent-later", "op-program-parent-later");
        assertThat(response.getAcks()).extracting(SyncAck::status).containsExactly("applied", "applied");
        assertThat(countEntityStateRows(guestUserId, "program_week", "week-parent-later")).isEqualTo(1);
    }

    @Test
    void syncRejectsChildWhenRequiredParentIsMissingAndWritesNoSyncRows() {
        SyncOp op = upsertOp("op-week-missing-parent", "program_week", "week-missing-parent", Map.of(
                "id", "week-missing-parent",
                "program_id", "missing-program",
                "updated_at", "2026-03-01T00:01:00Z"));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getDetails())
                        .containsEntry("field", "program_id")
                        .containsEntry("reason", "required parent is missing or inactive"));

        assertThat(countOwnerRows("entity_state", guestUserId)).isZero();
        assertThat(countOwnerRows("change_log", guestUserId)).isZero();
        assertThat(countOwnerRows("op_ledger", guestUserId)).isZero();
    }

    @Test
    void syncRejectsChildWhenRequiredParentIsTombstoned() {
        Instant now = Instant.now();
        syncRepository.upsertEntityState(guestUserId, "program", "program-deleted-parent", Map.of(
                "id", "program-deleted-parent",
                "deleted_at", "2026-03-01T00:00:00Z",
                "updated_at", "2026-03-01T00:00:00Z"), now);

        SyncOp op = upsertOp("op-week-deleted-parent", "program_week", "week-deleted-parent", Map.of(
                "id", "week-deleted-parent",
                "program_id", "program-deleted-parent",
                "updated_at", "2026-03-01T00:01:00Z"));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(ValidationException.class);

        assertThat(countEntityStateRows(guestUserId, "program_week", "week-deleted-parent")).isZero();
        assertThat(countChangeLogRows(guestUserId, "program_week", "week-deleted-parent")).isZero();
        assertThat(countOpLedgerRows(guestUserId, "op-week-deleted-parent")).isZero();
    }

    @Test
    void syncRejectsChildWhenRequiredParentExistsOnlyUnderDifferentOwner() {
        String otherGuestUserId = "guest-foreign-parent-" + System.currentTimeMillis();
        syncRepository.upsertEntityState(otherGuestUserId, "program", "program-foreign-parent", Map.of(
                "id", "program-foreign-parent",
                "updated_at", "2026-03-01T00:00:00Z"), Instant.now());

        SyncOp op = upsertOp("op-week-foreign-parent", "program_week", "week-foreign-parent", Map.of(
                "id", "week-foreign-parent",
                "program_id", "program-foreign-parent",
                "updated_at", "2026-03-01T00:01:00Z"));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getDetails())
                        .doesNotContainKey("parentId")
                        .doesNotContainKey("ownerId"));

        assertThat(countEntityStateRows(guestUserId, "program_week", "week-foreign-parent")).isZero();
        assertThat(countOpLedgerRows(guestUserId, "op-week-foreign-parent")).isZero();
    }

    @Test
    void syncRejectsTransitiveInvalidGraphAndWritesNoRows() {
        List<SyncOp> ops = List.of(
                upsertOp("op-set-invalid-transitive", "planned_set", "set-invalid-transitive", Map.of(
                        "id", "set-invalid-transitive",
                        "program_day_exercise_id", "day-ex-invalid-transitive",
                        "updated_at", "2026-03-01T00:03:00Z")),
                upsertOp("op-day-ex-invalid-transitive", "program_day_exercise", "day-ex-invalid-transitive",
                        Map.of(
                                "id", "day-ex-invalid-transitive",
                                "program_day_id", "missing-day",
                                "exercise_id", "ex_bench_press_barbell",
                                "updated_at", "2026-03-01T00:02:00Z")));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", ops))
                .isInstanceOf(ValidationException.class);

        assertThat(countOwnerRows("entity_state", guestUserId)).isZero();
        assertThat(countOwnerRows("change_log", guestUserId)).isZero();
        assertThat(countOwnerRows("op_ledger", guestUserId)).isZero();
    }

    @Test
    void syncAllowsBuiltInExerciseReferenceWithoutExerciseState() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(
                upsertOp("op-program-built-in-exercise", "program", "program-built-in-exercise", Map.of(
                        "id", "program-built-in-exercise",
                        "updated_at", "2026-03-01T00:00:00Z")),
                upsertOp("op-week-built-in-exercise", "program_week", "week-built-in-exercise", Map.of(
                        "id", "week-built-in-exercise",
                        "program_id", "program-built-in-exercise",
                        "updated_at", "2026-03-01T00:01:00Z")),
                upsertOp("op-day-built-in-exercise", "program_day", "day-built-in-exercise", Map.of(
                        "id", "day-built-in-exercise",
                        "program_week_id", "week-built-in-exercise",
                        "updated_at", "2026-03-01T00:02:00Z")),
                upsertOp("op-day-ex-built-in-exercise", "program_day_exercise", "day-ex-built-in-exercise",
                        Map.of(
                                "id", "day-ex-built-in-exercise",
                                "program_day_id", "day-built-in-exercise",
                                "exercise_id", "ex_bench_press_barbell",
                                "updated_at", "2026-03-01T00:03:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status)
                .containsExactly("applied", "applied", "applied", "applied");
        assertThat(countEntityStateRows(guestUserId, "program_day_exercise", "day-ex-built-in-exercise"))
                .isEqualTo(1);
    }

    @Test
    void syncRequiresCustomExerciseReferenceToExistOrApplyInSameRequest() {
        upsertPlanDayGraph(Instant.now());
        SyncOp op = upsertOp("op-day-ex-custom-missing", "program_day_exercise", "day-ex-custom-missing", Map.of(
                "id", "day-ex-custom-missing",
                "program_day_id", "day-1",
                "exercise_id", "ex_custom_missing",
                "updated_at", "2026-03-01T00:03:00Z"));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(ValidationException.class);

        assertThat(countEntityStateRows(guestUserId, "program_day_exercise", "day-ex-custom-missing")).isZero();
        assertThat(countOpLedgerRows(guestUserId, "op-day-ex-custom-missing")).isZero();
    }

    @Test
    void syncSkipsParentValidationForDeleteOpsAndTombstonePayloads() {
        SyncResponse deleteResponse = syncService.sync(deviceId, guestUserId, "0", List.of(new SyncOp(
                "op-delete-missing-parent",
                "program_week",
                "week-delete-missing-parent",
                "delete",
                Map.of("id", "week-delete-missing-parent", "deleted_at", "2026-03-01T00:00:00Z"),
                null)));
        SyncResponse tombstoneUpsertResponse = syncService.sync(deviceId, guestUserId, deleteResponse.getCursor(),
                List.of(upsertOp("op-upsert-tombstone-missing-parent", "program_week",
                        "week-upsert-tombstone-missing-parent", Map.of(
                                "id", "week-upsert-tombstone-missing-parent",
                                "program_id", "missing-program",
                                "deleted_at", "2026-03-01T00:01:00Z",
                                "updated_at", "2026-03-01T00:01:00Z"))));

        assertThat(deleteResponse.getAcks()).extracting(SyncAck::status).containsExactly("applied");
        assertThat(tombstoneUpsertResponse.getAcks()).extracting(SyncAck::status).containsExactly("applied");
        assertThat(countEntityStateRows(guestUserId, "program_week", "week-delete-missing-parent")).isEqualTo(1);
        assertThat(countEntityStateRows(guestUserId, "program_week", "week-upsert-tombstone-missing-parent"))
                .isEqualTo(1);
    }

    @Test
    void syncIgnoresOptionalSourceReferencesForWorkoutSessionGraph() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(upsertOp(
                "op-session-source-refs",
                "workout_session",
                "session-source-refs",
                Map.of(
                        "id", "session-source-refs",
                        "source_workout_plan_id", "missing-plan",
                        "source_program_day_id", "missing-day",
                        "updated_at", "2026-03-01T00:00:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsExactly("applied");
        assertThat(countEntityStateRows(guestUserId, "workout_session", "session-source-refs")).isEqualTo(1);
    }

    @Test
    void syncDoesNotRejectStaleChildUpsertThatConflictResolutionSkips() {
        Instant now = Instant.now();
        syncRepository.upsertEntityState(guestUserId, "program_week", "week-stale-child", Map.of(
                "id", "week-stale-child",
                "program_id", "missing-program",
                "updated_at", "2026-03-02T00:00:00Z"), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(upsertOp(
                "op-week-stale-child",
                "program_week",
                "week-stale-child",
                Map.of(
                        "id", "week-stale-child",
                        "program_id", "missing-program",
                        "updated_at", "2026-03-01T00:00:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsExactly("noop");
        assertThat(response.getAcks()).extracting(SyncAck::reason).containsExactly("stale update");
        assertThat(countOpLedgerRows(guestUserId, "op-week-stale-child")).isEqualTo(1);
    }

    @Test
    void syncDoesNotAcceptChildWhenSameRequestParentCandidateIsSkipped() {
        syncRepository.upsertEntityState(guestUserId, "program", "program-skipped-parent", Map.of(
                "id", "program-skipped-parent",
                "deleted_at", "2026-03-02T00:00:00Z",
                "updated_at", "2026-03-02T00:00:00Z"), Instant.now());

        List<SyncOp> ops = List.of(
                upsertOp("op-week-skipped-parent", "program_week", "week-skipped-parent", Map.of(
                        "id", "week-skipped-parent",
                        "program_id", "program-skipped-parent",
                        "updated_at", "2026-03-03T00:01:00Z")),
                upsertOp("op-program-skipped-parent", "program", "program-skipped-parent", Map.of(
                        "id", "program-skipped-parent",
                        "updated_at", "2026-03-03T00:00:00Z")));

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", ops))
                .isInstanceOf(ValidationException.class);

        assertThat(countEntityStateRows(guestUserId, "program_week", "week-skipped-parent")).isZero();
        assertThat(countOpLedgerRows(guestUserId, "op-program-skipped-parent")).isZero();
        assertThat(countOpLedgerRows(guestUserId, "op-week-skipped-parent")).isZero();
    }

    @Test
    void syncWritesValidSameBatchOfflinePlanGraph() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(
                upsertOp("op-set-plan-graph", "planned_set", "set-plan-graph", Map.of(
                        "id", "set-plan-graph",
                        "program_day_exercise_id", "day-ex-plan-graph",
                        "updated_at", "2026-03-01T00:05:00Z")),
                upsertOp("op-day-ex-plan-graph", "program_day_exercise", "day-ex-plan-graph", Map.of(
                        "id", "day-ex-plan-graph",
                        "program_day_id", "day-plan-graph",
                        "exercise_id", "ex_custom_plan_graph",
                        "updated_at", "2026-03-01T00:04:00Z")),
                upsertOp("op-exercise-plan-graph", "exercise", "ex_custom_plan_graph", Map.of(
                        "id", "ex_custom_plan_graph",
                        "updated_at", "2026-03-01T00:03:00Z")),
                upsertOp("op-day-plan-graph", "program_day", "day-plan-graph", Map.of(
                        "id", "day-plan-graph",
                        "program_week_id", "week-plan-graph",
                        "updated_at", "2026-03-01T00:02:00Z")),
                upsertOp("op-week-plan-graph", "program_week", "week-plan-graph", Map.of(
                        "id", "week-plan-graph",
                        "program_id", "program-plan-graph",
                        "updated_at", "2026-03-01T00:01:00Z")),
                upsertOp("op-program-plan-graph", "program", "program-plan-graph", Map.of(
                        "id", "program-plan-graph",
                        "updated_at", "2026-03-01T00:00:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsOnly("applied");
        assertThat(countEntityStateRows(guestUserId, "planned_set", "set-plan-graph")).isEqualTo(1);
    }

    @Test
    void syncWritesValidSameBatchOfflineWorkoutGraph() {
        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of(
                upsertOp("op-set-workout-graph", "workout_set", "set-workout-graph", Map.of(
                        "id", "set-workout-graph",
                        "workout_session_exercise_id", "session-ex-workout-graph",
                        "updated_at", "2026-03-01T00:03:00Z")),
                upsertOp("op-session-ex-workout-graph", "workout_session_exercise", "session-ex-workout-graph",
                        Map.of(
                                "id", "session-ex-workout-graph",
                                "workout_session_id", "session-workout-graph",
                                "exercise_id", "ex_bench_press_barbell",
                                "source_program_day_exercise_id", "missing-source-day-ex",
                                "updated_at", "2026-03-01T00:02:00Z")),
                upsertOp("op-session-workout-graph", "workout_session", "session-workout-graph", Map.of(
                        "id", "session-workout-graph",
                        "updated_at", "2026-03-01T00:01:00Z"))));

        assertThat(response.getAcks()).extracting(SyncAck::status).containsOnly("applied");
        assertThat(countEntityStateRows(guestUserId, "workout_set", "set-workout-graph")).isEqualTo(1);
    }

    @Test
    void syncEnforcesParentIsolationForAccountOwnerScope() {
        String accountOwnerId = "issuer.example|acct-parent-isolation";
        syncRepository.upsertEntityState("guest-foreign-account-parent", "program", "program-account-foreign-parent",
                Map.of(
                        "id", "program-account-foreign-parent",
                        "updated_at", "2026-03-01T00:00:00Z"),
                Instant.now());
        SyncOp op = upsertOp("op-account-foreign-parent", "program_week", "week-account-foreign-parent", Map.of(
                "id", "week-account-foreign-parent",
                "program_id", "program-account-foreign-parent",
                "updated_at", "2026-03-01T00:01:00Z"));

        assertThatThrownBy(() -> syncService.sync(deviceId, OwnerScope.account(accountOwnerId), "0", List.of(op)))
                .isInstanceOf(ValidationException.class);

        assertThat(countEntityStateRows(accountOwnerId, "program_week", "week-account-foreign-parent")).isZero();
        assertThat(countOpLedgerRows(accountOwnerId, "op-account-foreign-parent")).isZero();
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
    void sameOpIdFromDifferentOwnersAppliesIndependently() {
        String sharedOpId = "op-shared-owner-" + System.currentTimeMillis();
        String otherGuestUserId = "guest-other-" + System.currentTimeMillis();
        SyncOp firstOwnerOp = new SyncOp(
                sharedOpId,
                "program",
                "program-owner-1",
                "upsert",
                Map.of("id", "program-owner-1", "name", "Owner 1 Program"),
                null);
        SyncOp secondOwnerOp = new SyncOp(
                sharedOpId,
                "program",
                "program-owner-2",
                "upsert",
                Map.of("id", "program-owner-2", "name", "Owner 2 Program"),
                null);

        SyncResponse firstResponse = syncService.sync(deviceId, guestUserId, "0", List.of(firstOwnerOp));
        SyncResponse replayResponse = syncService.sync(deviceId, guestUserId, firstResponse.getCursor(),
                List.of(firstOwnerOp));
        SyncResponse secondResponse = syncService.sync("device-other", otherGuestUserId, "0", List.of(secondOwnerOp));

        Integer ledgerRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM op_ledger WHERE op_id = ?",
                Integer.class,
                sharedOpId);

        assertThat(firstResponse.getAcks())
                .extracting(ack -> ack.status())
                .containsExactly("applied");
        assertThat(replayResponse.getAcks())
                .extracting(ack -> ack.status())
                .containsExactly("noop");
        assertThat(secondResponse.getAcks())
                .extracting(ack -> ack.status())
                .containsExactly("applied");
        assertThat(ledgerRows).isEqualTo(2);
        assertThat(entityOwner("program", "program-owner-1")).isEqualTo(guestUserId);
        assertThat(entityOwner("program", "program-owner-2")).isEqualTo(otherGuestUserId);
    }

    @Test
    void freshSyncReturnsCurrentSnapshotInsteadOfHistoricalReorderDeltas() {
        String programId = "program-reorder";
        String weekId = "week-reorder";
        String dayId = "day-reorder";
        String exerciseId = "exercise-reorder";
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
        upsertEntityStateAndChangeLog("program", programId, Map.of(
                "id", programId,
                "name", "Program"), now);
        upsertEntityStateAndChangeLog("program_week", weekId, Map.of(
                "id", weekId,
                "program_id", programId,
                "week_index", 0), now);
        upsertEntityStateAndChangeLog("program_day", dayId, Map.of(
                "id", dayId,
                "program_week_id", weekId,
                "day_index", 0), now);
        upsertEntityStateAndChangeLog("exercise", exerciseId, Map.of(
                "id", exerciseId,
                "name", "Squat"), now);
        upsertEntityStateAndChangeLog("program_day_exercise", firstExerciseId, Map.of(
                "id", firstExerciseId,
                "program_day_id", dayId,
                "exercise_id", exerciseId,
                "position", 2), now);
        upsertEntityStateAndChangeLog("program_day_exercise", secondExerciseId, Map.of(
                "id", secondExerciseId,
                "program_day_id", dayId,
                "exercise_id", exerciseId,
                "position", 1), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getCursor()).isEqualTo(String.valueOf(maxChangeId()));
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly(
                        "program",
                        "program_week",
                        "program_day",
                        "exercise",
                        "program_day_exercise",
                        "program_day_exercise");
        assertThat(response.getDeltas().stream()
                .filter(delta -> delta.entityType().equals("program_day_exercise"))
                .toList())
                .extracting(SyncDelta::entityId)
                .containsExactly(firstExerciseId, secondExerciseId);
        assertThat(response.getDeltas().stream()
                .filter(delta -> delta.entityType().equals("program_day_exercise"))
                .toList())
                .extracting(delta -> delta.payload().get("position"))
                .containsExactly(2, 1);
        assertThat(response.getDeltas().stream()
                .filter(delta -> delta.entityType().equals("program_day_exercise"))
                .toList())
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
    void numericCursorGreaterThanZeroKeepsIncrementalDeleteDeltas() {
        insertChangeLog("program", "program-old", Map.of("id", "program-old"));
        long cursor = maxChangeId();
        syncRepository.insertChangeLog(guestUserId, "program", "program-deleted", "delete", Map.of(
                "id", "program-deleted",
                "deleted_at", "2026-04-28T00:00:00Z"));

        SyncResponse response = syncService.sync(deviceId, guestUserId, String.valueOf(cursor), List.of());

        assertThat(response.getDeltas()).hasSize(1);
        assertThat(response.getDeltas().get(0).entityId()).isEqualTo("program-deleted");
        assertThat(response.getDeltas().get(0).opType()).isEqualTo("delete");
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

    @Test
    void freshSnapshotReturnsDependencyClosedPlanGraph() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("planned_set", "set-1", Map.of(
                "id", "set-1",
                "program_day_exercise_id", "day-exercise-1",
                "set_index", 0), now);
        upsertEntityStateAndChangeLog("program_day_exercise", "day-exercise-1", Map.of(
                "id", "day-exercise-1",
                "program_day_id", "day-1",
                "exercise_id", "exercise-1",
                "position", 0), now);
        upsertEntityStateAndChangeLog("program_day", "day-1", Map.of(
                "id", "day-1",
                "program_week_id", "week-1",
                "day_index", 0), now);
        upsertEntityStateAndChangeLog("program_week", "week-1", Map.of(
                "id", "week-1",
                "program_id", "program-1",
                "week_index", 0), now);
        upsertEntityStateAndChangeLog("program", "program-1", Map.of(
                "id", "program-1",
                "name", "Program"), now);
        upsertEntityStateAndChangeLog("exercise", "exercise-1", Map.of(
                "id", "exercise-1",
                "name", "Squat"), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly(
                        "program",
                        "program_week",
                        "program_day",
                        "exercise",
                        "program_day_exercise",
                        "planned_set");
    }

    @Test
    void freshSnapshotRestoresPlanExerciseAndPlannedSetForSeededExerciseReference() {
        Instant now = Instant.now();
        upsertPlanDayGraph(now);
        upsertEntityStateAndChangeLog("program_day_exercise", "day-exercise-seeded", Map.of(
                "id", "day-exercise-seeded",
                "program_day_id", "day-1",
                "exercise_id", "ex_bench_press_barbell",
                "position", 0), now);
        upsertEntityStateAndChangeLog("planned_set", "set-seeded", Map.of(
                "id", "set-seeded",
                "program_day_exercise_id", "day-exercise-seeded",
                "set_index", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly(
                        "program-1",
                        "week-1",
                        "day-1",
                        "day-exercise-seeded",
                        "set-seeded");
    }

    @Test
    void freshSnapshotRestoresCustomPlanExerciseOnlyWhenExerciseStateExists() {
        Instant now = Instant.now();
        upsertPlanDayGraph(now);
        upsertEntityStateAndChangeLog("exercise", "ex_custom_owned", Map.of(
                "id", "ex_custom_owned",
                "name", "Custom Lift",
                "is_custom", 1), now);
        upsertEntityStateAndChangeLog("program_day_exercise", "day-exercise-custom-owned", Map.of(
                "id", "day-exercise-custom-owned",
                "program_day_id", "day-1",
                "exercise_id", "ex_custom_owned",
                "position", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly(
                        "program-1",
                        "week-1",
                        "day-1",
                        "ex_custom_owned",
                        "day-exercise-custom-owned");
    }

    @Test
    void freshSnapshotOmitsCustomPlanExerciseWhenExerciseStateIsMissingOrTombstoned() {
        Instant now = Instant.now();
        upsertPlanDayGraph(now);
        upsertEntityStateAndChangeLog("exercise", "ex_custom_deleted", Map.of(
                "id", "ex_custom_deleted",
                "name", "Deleted Custom Lift",
                "is_custom", 1,
                "deleted_at", "2026-04-28T00:00:00Z"), now);
        upsertEntityStateAndChangeLog("program_day_exercise", "day-exercise-custom-missing", Map.of(
                "id", "day-exercise-custom-missing",
                "program_day_id", "day-1",
                "exercise_id", "ex_custom_missing",
                "position", 0), now);
        upsertEntityStateAndChangeLog("program_day_exercise", "day-exercise-custom-deleted", Map.of(
                "id", "day-exercise-custom-deleted",
                "program_day_id", "day-1",
                "exercise_id", "ex_custom_deleted",
                "position", 1), now);
        upsertEntityStateAndChangeLog("planned_set", "set-custom-omitted", Map.of(
                "id", "set-custom-omitted",
                "program_day_exercise_id", "day-exercise-custom-missing",
                "set_index", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly("program-1", "week-1", "day-1");
    }

    @Test
    void freshSnapshotOmitsOrphanActivePlanChildren() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("exercise", "exercise-1", Map.of(
                "id", "exercise-1",
                "name", "Squat"), now);
        upsertEntityStateAndChangeLog("program_day_exercise", "orphan-day-exercise", Map.of(
                "id", "orphan-day-exercise",
                "program_day_id", "missing-day",
                "exercise_id", "exercise-1",
                "position", 0), now);
        upsertEntityStateAndChangeLog("planned_set", "orphan-set", Map.of(
                "id", "orphan-set",
                "program_day_exercise_id", "missing-day-exercise",
                "set_index", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly("exercise-1");
    }

    @Test
    void freshSnapshotOmitsTombstonesAndActiveChildrenUnderTombstonedParents() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("program", "program-1", Map.of(
                "id", "program-1",
                "name", "Program"), now);
        upsertEntityStateAndChangeLog("program_week", "week-deleted", Map.of(
                "id", "week-deleted",
                "program_id", "program-1",
                "week_index", 0,
                "deleted_at", "2026-04-28T00:00:00Z"), now);
        upsertEntityStateAndChangeLog("program_day", "day-under-deleted-week", Map.of(
                "id", "day-under-deleted-week",
                "program_week_id", "week-deleted",
                "day_index", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityId)
                .containsExactly("program-1");
        assertThat(response.getDeltas())
                .extracting(SyncDelta::opType)
                .containsOnly("upsert");
    }

    @Test
    void freshSnapshotOmitsWorkoutHistoryChildrenWithoutRequiredParents() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("workout_session_exercise", "orphan-session-exercise", Map.of(
                "id", "orphan-session-exercise",
                "workout_session_id", "missing-session",
                "position", 0), now);
        upsertEntityStateAndChangeLog("workout_set", "orphan-workout-set", Map.of(
                "id", "orphan-workout-set",
                "workout_session_exercise_id", "missing-session-exercise",
                "set_index", 0), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas()).isEmpty();
        assertThat(response.getCursor()).isEqualTo(String.valueOf(maxChangeId()));
    }

    @Test
    void freshSnapshotExcludesPrEventBecausePrEventsAreLocalDerived() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("exercise", "exercise-1", Map.of(
                "id", "exercise-1",
                "name", "Squat"), now);
        upsertEntityStateAndChangeLog("workout_session", "session-1", Map.of(
                "id", "session-1",
                "status", "completed"), now);
        upsertEntityStateAndChangeLog("pr_event", "orphan-pr", Map.of(
                "id", "orphan-pr",
                "session_id", "session-1",
                "exercise_id", "exercise-1",
                "pr_type", "max_weight",
                "context", "",
                "value", 100), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly("exercise", "workout_session");
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .doesNotContain("pr_event");
    }

    @Test
    void incrementalSyncExcludesPrEventBecausePrEventsAreLocalDerived() {
        insertChangeLog("program", "program-old", Map.of("id", "program-old"));
        long cursor = maxChangeId();
        insertChangeLog("pr_event", "pr-local-derived", Map.of(
                "id", "pr-local-derived",
                "session_id", "session-1",
                "exercise_id", "ex_bench_press_barbell",
                "pr_type", "weight",
                "context", "",
                "value", 100));

        SyncResponse response = syncService.sync(deviceId, guestUserId, String.valueOf(cursor), List.of());

        assertThat(response.getDeltas()).isEmpty();
        assertThat(response.getCursor()).isEqualTo(String.valueOf(cursor));
    }

    @Test
    void outboundPrEventOpIsRejectedAsUnsupportedSyncedType() {
        SyncOp op = new SyncOp(
                "op-pr-event",
                "pr_event",
                "pr-1",
                "upsert",
                Map.of("id", "pr-1", "session_id", "session-1"),
                null);

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(com.gymapp.backend.controller.ValidationException.class)
                .hasMessageContaining("Invalid sync operation");
    }

    @Test
    void freshSnapshotExcludesAppMetaBecauseAppMetaIsLocalOnly() {
        Instant now = Instant.now();
        upsertEntityStateAndChangeLog("program", "program-1", Map.of("id", "program-1", "name", "Plan"), now);
        upsertEntityStateAndChangeLog("app_meta", "claimed_user_id", Map.of(
                "key", "claimed_user_id",
                "value", "issuer.example|account-1"), now);

        SyncResponse response = syncService.sync(deviceId, guestUserId, "0", List.of());

        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .containsExactly("program");
        assertThat(response.getDeltas())
                .extracting(SyncDelta::entityType)
                .doesNotContain("app_meta");
    }

    @Test
    void incrementalSyncExcludesAppMetaBecauseAppMetaIsLocalOnly() {
        insertChangeLog("program", "program-old", Map.of("id", "program-old"));
        long cursor = maxChangeId();
        insertChangeLog("app_meta", "auth_debug_state_v1", Map.of(
                "key", "auth_debug_state_v1",
                "value", "{}"));

        SyncResponse response = syncService.sync(deviceId, guestUserId, String.valueOf(cursor), List.of());

        assertThat(response.getDeltas()).isEmpty();
        assertThat(response.getCursor()).isEqualTo(String.valueOf(cursor));
    }

    @Test
    void outboundAppMetaOpIsRejectedAsUnsupportedSyncedType() {
        SyncOp op = new SyncOp(
                "op-app-meta",
                "app_meta",
                "claimed_user_id",
                "upsert",
                Map.of("key", "claimed_user_id", "value", "issuer.example|account-1"),
                null);

        assertThatThrownBy(() -> syncService.sync(deviceId, guestUserId, "0", List.of(op)))
                .isInstanceOf(com.gymapp.backend.controller.ValidationException.class)
                .hasMessageContaining("Invalid sync operation");
    }

    private void insertChanges(int count) {
        Instant now = Instant.now();
        for (int i = 1; i <= count; i += 1) {
            upsertEntityStateAndChangeLog("program", "program-" + i,
                    Map.of("id", "program-" + i, "name", "Program " + i), now);
        }
    }

    private void upsertPlanDayGraph(Instant now) {
        upsertEntityStateAndChangeLog("program", "program-1", Map.of(
                "id", "program-1",
                "name", "Program"), now);
        upsertEntityStateAndChangeLog("program_week", "week-1", Map.of(
                "id", "week-1",
                "program_id", "program-1",
                "week_index", 0), now);
        upsertEntityStateAndChangeLog("program_day", "day-1", Map.of(
                "id", "day-1",
                "program_week_id", "week-1",
                "day_index", 0), now);
    }

    private void upsertEntityStateAndChangeLog(String entityType, String entityId, Map<String, Object> payload,
            Instant receivedAt) {
        syncRepository.upsertEntityState(guestUserId, entityType, entityId, payload, receivedAt);
        insertChangeLog(entityType, entityId, payload);
    }

    private void insertChangeLog(String entityType, String entityId, Map<String, Object> payload) {
        syncRepository.insertChangeLog(guestUserId, entityType, entityId, "upsert", payload);
    }

    private SyncOp upsertOp(String opId, String entityType, String entityId, Map<String, Object> payload) {
        return new SyncOp(opId, entityType, entityId, "upsert", payload, null);
    }

    private long countOwnerRows(String table, String ownerId) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE guest_user_id = ?",
                Long.class,
                ownerId);
        return count == null ? 0L : count;
    }

    private long countEntityStateRows(String ownerId, String entityType, String entityId) {
        Long count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM entity_state
                        WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?
                        """,
                Long.class,
                ownerId,
                entityType,
                entityId);
        return count == null ? 0L : count;
    }

    private long countChangeLogRows(String ownerId, String entityType, String entityId) {
        Long count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM change_log
                        WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?
                        """,
                Long.class,
                ownerId,
                entityType,
                entityId);
        return count == null ? 0L : count;
    }

    private long countOpLedgerRows(String ownerId, String opId) {
        Long count = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM op_ledger
                        WHERE guest_user_id = ? AND op_id = ?
                        """,
                Long.class,
                ownerId,
                opId);
        return count == null ? 0L : count;
    }

    private long maxChangeId() {
        Long maxChangeId = jdbcTemplate.queryForObject(
                "SELECT MAX(change_id) FROM change_log WHERE guest_user_id = ?",
                Long.class,
                guestUserId);
        assertThat(maxChangeId).isNotNull();
        return maxChangeId;
    }

    private String entityOwner(String entityType, String entityId) {
        return jdbcTemplate.queryForObject(
                "SELECT guest_user_id FROM entity_state WHERE entity_type = ? AND entity_id = ?",
                String.class,
                entityType,
                entityId);
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
