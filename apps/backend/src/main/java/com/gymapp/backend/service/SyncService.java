package com.gymapp.backend.service;

import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.controller.ConflictException;
import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.config.SyncGuardrailsProperties;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Service
public class SyncService {
        private static final int DELTA_LIMIT = 1000;
        private static final Duration CLIENT_UPDATED_AT_ALLOWED_FUTURE_SKEW = Duration.ofMinutes(5);
        private static final String SNAPSHOT_CURSOR_PREFIX = "snapshot:";
        private static final Set<String> APP_META_DENYLIST = Set.of(
                        "access_token",
                        "auth_token",
                        "device_token",
                        "refresh_token",
                        "secret",
                        "token");
        private static final Map<String, OrderedEntityConfig> ORDERED_ENTITY_CONFIGS = Map.of(
                        "program_week", new OrderedEntityConfig("program_id"),
                        "program_day", new OrderedEntityConfig("program_week_id"),
                        "program_day_exercise", new OrderedEntityConfig("program_day_id"),
                        "planned_set", new OrderedEntityConfig("program_day_exercise_id"),
                        "workout_session_exercise", new OrderedEntityConfig("workout_session_id"),
                        "workout_set", new OrderedEntityConfig("workout_session_exercise_id"));
        private static final Map<String, List<ParentReference>> REQUIRED_PARENT_REFERENCES = Map.of(
                        "program_week", List.of(new ParentReference("program_id", "program", false)),
                        "program_day", List.of(new ParentReference("program_week_id", "program_week", false)),
                        "program_day_exercise", List.of(
                                        new ParentReference("program_day_id", "program_day", false),
                                        new ParentReference("exercise_id", "exercise", true)),
                        "planned_set", List.of(new ParentReference("program_day_exercise_id", "program_day_exercise",
                                        false)),
                        "workout_session_exercise", List.of(
                                        new ParentReference("workout_session_id", "workout_session", false),
                                        new ParentReference("exercise_id", "exercise", true)),
                        "workout_set", List.of(new ParentReference("workout_session_exercise_id",
                                        "workout_session_exercise", false)));
        private static final Map<String, Set<String>> ALLOWED_PAYLOAD_FIELDS = Map.of(
                        "program", Set.of(
                                        "id", "name", "description", "is_template", "owner_user_id",
                                        "created_at", "updated_at", "deleted_at", "version",
                                        "last_modified_by_device_id"),
                        "program_week", Set.of(
                                        "id", "program_id", "week_index", "created_at", "updated_at",
                                        "deleted_at", "version", "last_modified_by_device_id"),
                        "program_day", Set.of(
                                        "id", "program_week_id", "day_index", "name", "created_at",
                                        "updated_at", "deleted_at", "version", "last_modified_by_device_id"),
                        "exercise", Set.of(
                                        "id", "name", "normalized_name", "is_custom", "owner_user_id",
                                        "equipment", "primary_muscle", "notes", "exercise_type",
                                        "cardio_profile", "created_at", "updated_at", "deleted_at",
                                        "version", "last_modified_by_device_id"),
                        "program_day_exercise", Set.of(
                                        "id", "program_day_id", "exercise_id", "position", "notes",
                                        "created_at", "updated_at", "deleted_at", "version",
                                        "last_modified_by_device_id"),
                        "planned_set", Set.of(
                                        "id", "program_day_exercise_id", "set_index", "target_reps_min",
                                        "target_reps_max", "target_rpe", "target_weight", "rest_seconds",
                                        "created_at", "updated_at", "deleted_at", "version",
                                        "last_modified_by_device_id"),
                        "workout_session", Set.of(
                                        "id", "source_workout_plan_id", "source_program_day_id", "title",
                                        "status", "started_at", "ended_at", "workout_note", "created_at",
                                        "updated_at", "deleted_at"),
                        "workout_session_exercise", Set.of(
                                        "id", "workout_session_id", "source_program_day_exercise_id",
                                        "exercise_id", "exercise_name", "exercise_type", "cardio_profile",
                                        "position", "notes", "plan_note_snapshot", "cardio_duration_minutes",
                                        "cardio_distance_km", "cardio_speed_kph", "cardio_incline_percent",
                                        "cardio_resistance_level", "cardio_pace_seconds_per_km",
                                        "cardio_floors", "cardio_stair_level", "created_at", "updated_at",
                                        "deleted_at"),
                        "workout_set", Set.of(
                                        "id", "workout_session_exercise_id", "set_index", "weight", "reps",
                                        "rpe", "rest_seconds", "notes", "is_completed", "created_at",
                                        "updated_at", "deleted_at"));

        private final SyncRepository syncRepository;
        private final AccountDeletionRepository accountDeletionRepository;
        private final SyncGuardrailsProperties syncGuardrailsProperties;
        private final ObjectMapper objectMapper;

        @Autowired
        public SyncService(
                        SyncRepository syncRepository,
                        AccountDeletionRepository accountDeletionRepository,
                        SyncGuardrailsProperties syncGuardrailsProperties,
                        ObjectMapper objectMapper) {
                this.syncRepository = syncRepository;
                this.accountDeletionRepository = accountDeletionRepository;
                this.syncGuardrailsProperties = syncGuardrailsProperties;
                this.objectMapper = objectMapper;
        }

        public SyncService(SyncRepository syncRepository, AccountDeletionRepository accountDeletionRepository) {
                this(
                                syncRepository,
                                accountDeletionRepository,
                                new SyncGuardrailsProperties(),
                                JsonMapper.builder().findAndAddModules().build());
        }

        @Transactional(isolation = Isolation.REPEATABLE_READ)
        public SyncResponse sync(String deviceId, String guestUserId, String cursor, List<SyncOp> ops) {
                return sync(deviceId, OwnerScope.guest(guestUserId), cursor, ops);
        }

        @Transactional(isolation = Isolation.REPEATABLE_READ)
        public SyncResponse sync(String deviceId, OwnerScope ownerScope, String cursor, List<SyncOp> ops) {
                String ownerId = ownerScope.getOwnerId();

                if ("guest".equals(ownerScope.getType()) && (deviceId == null || deviceId.isBlank())) {
                        throw new ValidationException(
                                        "sync transport context missing device id",
                                        Map.of("field", "deviceId", "ownerType", ownerScope.getType()));
                }
                if ("account".equals(ownerScope.getType())) {
                        accountDeletionRepository.lockAccountOwnerForTransaction(ownerId);
                        if (accountDeletionRepository.isAccountDeleted(ownerId)) {
                                throw new AccountDeletedException();
                        }
                }

                List<String> allowedEntityTypes = SyncEntityTypes.ORDERED_TYPES;

                ParsedCursor parsedCursor = parseCursorOrThrow(cursor, allowedEntityTypes);

                ops = validateAndCanonicalizeOps(ops, allowedEntityTypes);
                Instant requestReceivedAt = Instant.now();
                List<SyncOpPlan> plans = buildSyncPlan(ownerId, ops, requestReceivedAt);
                List<SyncAck> acks = persistSyncPlan(deviceId, ownerId, plans, ops.size(), requestReceivedAt);

                SyncResponse deltaResponse = fetchResponseDeltas(ownerId, cursor, parsedCursor, allowedEntityTypes);
                return new SyncResponse(acks, deltaResponse.getCursor(), deltaResponse.getDeltas(),
                                deltaResponse.getHasMore());
        }

        private List<SyncOpPlan> buildSyncPlan(String ownerId, List<SyncOp> ops, Instant receivedAt) {
                Set<String> opIds = new HashSet<>();
                for (SyncOp op : ops) {
                        opIds.add(op.opId());
                }
                Set<String> existingLedgerIds = syncRepository.findExistingOpLedgerIdsForOwner(ownerId, opIds);
                Set<String> seenRequestOpIds = new HashSet<>();
                List<IndexedSyncOp> candidates = new ArrayList<>();
                List<SyncOpPlan> plans = new ArrayList<>();

                for (int i = 0; i < ops.size(); i += 1) {
                        SyncOp op = ops.get(i);
                        if (existingLedgerIds.contains(op.opId()) || !seenRequestOpIds.add(op.opId())) {
                                plans.add(new SyncOpPlan(
                                                i,
                                                op,
                                                op.opType().toLowerCase(),
                                                new ResolutionResult("noop", "duplicate op", null),
                                                true));
                                continue;
                        }
                        candidates.add(new IndexedSyncOp(i, op));
                }

                Set<SyncRepository.EntityKey> referencedParentKeys = collectReferencedParentKeys(candidates);
                Map<SyncRepository.EntityKey, SyncRepository.EntityPresence> existingParentPresence = syncRepository
                                .findEntityPresenceForOwner(ownerId, referencedParentKeys);
                Set<SyncRepository.EntityKey> foreignParentKeys = syncRepository.findForeignEntityKeys(ownerId,
                                referencedParentKeys);
                PreRequestWorkoutCompletionState preRequestWorkoutCompletionState = collectPreRequestWorkoutCompletionState(
                                ownerId,
                                candidates);
                Set<SyncRepository.EntityKey> appliedActiveKeys = new HashSet<>();
                Set<SyncRepository.EntityKey> plannedInactiveKeys = new HashSet<>();
                Map<SyncRepository.EntityKey, SyncRepository.EntityStateRecord> plannedStateByKey = new HashMap<>();

                candidates.stream()
                                .sorted(Comparator
                                                .comparingInt((IndexedSyncOp indexed) -> entityTypeOrder(
                                                                indexed.op().entityType()))
                                                .thenComparingInt(IndexedSyncOp::originalIndex))
                                .forEach(indexed -> plans.add(buildCandidatePlan(
                                                ownerId,
                                                indexed,
                                                receivedAt,
                                                existingParentPresence,
                                                foreignParentKeys,
                                                appliedActiveKeys,
                                                plannedInactiveKeys,
                                                plannedStateByKey,
                                                preRequestWorkoutCompletionState)));

                return plans;
        }

        private SyncOpPlan buildCandidatePlan(
                        String ownerId,
                        IndexedSyncOp indexed,
                        Instant receivedAt,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityPresence> existingParentPresence,
                        Set<SyncRepository.EntityKey> foreignParentKeys,
                        Set<SyncRepository.EntityKey> appliedActiveKeys,
                        Set<SyncRepository.EntityKey> plannedInactiveKeys,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityStateRecord> plannedStateByKey,
                        PreRequestWorkoutCompletionState preRequestWorkoutCompletionState) {
                SyncOp op = indexed.op();
                String opType = op.opType().toLowerCase();
                enforceOwnership(ownerId, op);

                SyncRepository.EntityKey key = new SyncRepository.EntityKey(op.entityType(), op.entityId());
                SyncRepository.EntityStateRecord plannedState = plannedStateByKey.get(key);
                Optional<SyncRepository.EntityStateRecord> existingState = plannedState == null
                                ? syncRepository.findEntityStateWithReceivedAtForOwner(
                                                ownerId,
                                                op.entityType(),
                                                op.entityId())
                                : Optional.of(plannedState);

                Map<String, Object> existingPayload = existingState
                                .map(SyncRepository.EntityStateRecord::payload)
                                .orElse(null);
                Instant existingReceivedAt = existingState
                                .map(SyncRepository.EntityStateRecord::lastReceivedAt)
                                .orElse(null);

                ResolutionResult resolution = resolveConflict(
                                ownerId,
                                op,
                                opType,
                                existingPayload,
                                existingReceivedAt,
                                receivedAt,
                                preRequestWorkoutCompletionState);

                if ("applied".equals(resolution.status())) {
                        validateParentsForAppliedOp(
                                        op,
                                        opType,
                                        resolution.payload(),
                                        existingParentPresence,
                                        foreignParentKeys,
                                        appliedActiveKeys,
                                        plannedInactiveKeys);
                        plannedStateByKey.put(key, new SyncRepository.EntityStateRecord(resolution.payload(),
                                        receivedAt));
                        if (isActiveUpsert(opType, resolution.payload())) {
                                appliedActiveKeys.add(key);
                                plannedInactiveKeys.remove(key);
                        } else {
                                appliedActiveKeys.remove(key);
                                plannedInactiveKeys.add(key);
                        }
                }

                return new SyncOpPlan(indexed.originalIndex(), op, opType, resolution, false);
        }

        private List<SyncAck> persistSyncPlan(
                        String deviceId,
                        String ownerId,
                        List<SyncOpPlan> plans,
                        int opCount,
                        Instant receivedAt) {
                SyncAck[] ackByOriginalIndex = new SyncAck[opCount];
                for (SyncOpPlan plan : plans) {
                        SyncOp op = plan.op();
                        if (plan.duplicate()) {
                                ackByOriginalIndex[plan.originalIndex()] = new SyncAck(
                                                op.opId(),
                                                plan.resolution().status(),
                                                plan.resolution().reason());
                                continue;
                        }

                        boolean inserted = syncRepository.insertOpLedgerIfAbsentForOwner(op.opId(), deviceId, ownerId,
                                        receivedAt);
                        if (!inserted) {
                                ackByOriginalIndex[plan.originalIndex()] = new SyncAck(op.opId(), "noop",
                                                "duplicate op");
                                continue;
                        }

                        if ("applied".equals(plan.resolution().status())) {
                                syncRepository.upsertEntityStateForOwner(
                                                ownerId,
                                                op.entityType(),
                                                op.entityId(),
                                                plan.resolution().payload(),
                                                receivedAt);

                                syncRepository.insertChangeLogForOwner(
                                                ownerId,
                                                op.entityType(),
                                                op.entityId(),
                                                plan.opType(),
                                                plan.resolution().payload());
                        }

                        ackByOriginalIndex[plan.originalIndex()] = new SyncAck(
                                        op.opId(),
                                        plan.resolution().status(),
                                        plan.resolution().reason());
                }

                List<SyncAck> acks = new ArrayList<>(opCount);
                for (SyncAck ack : ackByOriginalIndex) {
                        if (ack != null) {
                                acks.add(ack);
                        }
                }
                return acks;
        }

        private Set<SyncRepository.EntityKey> collectReferencedParentKeys(List<IndexedSyncOp> ops) {
                Set<SyncRepository.EntityKey> keys = new HashSet<>();
                for (IndexedSyncOp indexed : ops) {
                        SyncOp op = indexed.op();
                        String opType = op.opType().toLowerCase();
                        if ("delete".equals(opType) || hasTombstone(op.payload())) {
                                continue;
                        }
                        for (ParentReference reference : REQUIRED_PARENT_REFERENCES.getOrDefault(
                                        op.entityType(),
                                        List.of())) {
                                String parentId = getText(op.payload(), reference.field());
                                if (parentId == null || (reference.exerciseReference()
                                                && isBuiltInExerciseReference(parentId))) {
                                        continue;
                                }
                                keys.add(new SyncRepository.EntityKey(reference.parentEntityType(), parentId));
                        }
                }
                return keys;
        }

        private PreRequestWorkoutCompletionState collectPreRequestWorkoutCompletionState(
                        String ownerId,
                        List<IndexedSyncOp> ops) {
                Set<String> sessionIds = new HashSet<>();
                Set<String> sessionExerciseIds = new HashSet<>();
                Set<String> setIds = new HashSet<>();
                Map<String, String> sessionIdBySessionExerciseId = new HashMap<>();

                for (IndexedSyncOp indexed : ops) {
                        SyncOp op = indexed.op();
                        if ("workout_session".equals(op.entityType())) {
                                sessionIds.add(op.entityId());
                                continue;
                        }
                        if ("workout_session_exercise".equals(op.entityType())) {
                                sessionExerciseIds.add(op.entityId());
                                String sessionId = getText(op.payload(), "workout_session_id");
                                if (sessionId != null) {
                                        sessionIds.add(sessionId);
                                        sessionIdBySessionExerciseId.put(op.entityId(), sessionId);
                                }
                                continue;
                        }
                        if ("workout_set".equals(op.entityType())) {
                                setIds.add(op.entityId());
                                String sessionExerciseId = getText(op.payload(), "workout_session_exercise_id");
                                if (sessionExerciseId != null) {
                                        sessionExerciseIds.add(sessionExerciseId);
                                }
                        }
                }

                Map<String, String> sessionExerciseIdBySetId = syncRepository
                                .findWorkoutSessionExerciseIdsByWorkoutSetIdsForOwner(ownerId, setIds);
                sessionExerciseIds.addAll(sessionExerciseIdBySetId.values());

                Map<String, String> preRequestSessionIdBySessionExerciseId = syncRepository
                                .findWorkoutSessionIdsBySessionExerciseIdsForOwner(ownerId, sessionExerciseIds);
                sessionIdBySessionExerciseId.putAll(preRequestSessionIdBySessionExerciseId);
                sessionIds.addAll(sessionIdBySessionExerciseId.values());

                Set<String> completedSessionIds = syncRepository.findCompletedWorkoutSessionIdsForOwner(ownerId,
                                sessionIds);
                return new PreRequestWorkoutCompletionState(
                                completedSessionIds,
                                sessionIdBySessionExerciseId,
                                sessionExerciseIdBySetId);
        }

        private void validateParentsForAppliedOp(
                        SyncOp op,
                        String opType,
                        Map<String, Object> payload,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityPresence> existingParentPresence,
                        Set<SyncRepository.EntityKey> foreignParentKeys,
                        Set<SyncRepository.EntityKey> appliedActiveKeys,
                        Set<SyncRepository.EntityKey> plannedInactiveKeys) {
                if (!isActiveUpsert(opType, payload)) {
                        return;
                }

                for (ParentReference reference : REQUIRED_PARENT_REFERENCES.getOrDefault(op.entityType(), List.of())) {
                        String parentId = getText(payload, reference.field());
                        if (parentId == null) {
                                throw invalidParentReference(op, reference.field());
                        }
                        if (reference.exerciseReference() && isBuiltInExerciseReference(parentId)) {
                                continue;
                        }

                        SyncRepository.EntityKey parentKey = new SyncRepository.EntityKey(reference.parentEntityType(),
                                        parentId);
                        if (foreignParentKeys.contains(parentKey)) {
                                throw invalidParentReference(op, reference.field());
                        }
                        if (plannedInactiveKeys.contains(parentKey)) {
                                throw invalidParentReference(op, reference.field());
                        }
                        if (appliedActiveKeys.contains(parentKey)) {
                                continue;
                        }
                        if (existingParentPresence.get(parentKey) == SyncRepository.EntityPresence.ACTIVE) {
                                continue;
                        }
                        throw invalidParentReference(op, reference.field());
                }
        }

        private ValidationException invalidParentReference(SyncOp op, String field) {
                return new ValidationException(
                                "Invalid sync operation",
                                buildDetails(op, field, "required parent is missing or inactive"));
        }

        private boolean isActiveUpsert(String opType, Map<String, Object> payload) {
                return !"delete".equals(opType) && !hasTombstone(payload);
        }

        private boolean hasTombstone(Map<String, Object> payload) {
                return getText(payload, "deleted_at") != null || getText(payload, "deletedAt") != null;
        }

        private boolean isBuiltInExerciseReference(String id) {
                // Seeded catalog exercise ids are shared constants, while ex_custom_* is owner data.
                return id != null && id.startsWith("ex_") && !id.startsWith("ex_custom_");
        }

        private int entityTypeOrder(String entityType) {
                int index = SyncEntityTypes.ORDERED_TYPES.indexOf(entityType);
                return index >= 0 ? index : Integer.MAX_VALUE;
        }

        private SyncResponse fetchResponseDeltas(
                        String ownerId,
                        String requestCursor,
                        ParsedCursor parsedCursor,
                        List<String> allowedEntityTypes) {
                if (parsedCursor.mode() == CursorMode.SNAPSHOT || parsedCursor.numericValue() == 0L) {
                        long highWaterChangeId = parsedCursor.mode() == CursorMode.SNAPSHOT
                                        ? parsedCursor.snapshotHighWaterChangeId()
                                        : syncRepository.findHighWaterChangeIdForOwner(ownerId);
                        List<SyncDelta> fetchedDeltas = syncRepository.fetchEntityStateSnapshotForOwner(
                                        ownerId,
                                        parsedCursor.snapshotAfterEntityType(),
                                        parsedCursor.snapshotAfterEntityId(),
                                        DELTA_LIMIT + 1,
                                        allowedEntityTypes,
                                        highWaterChangeId);
                        boolean hasMore = fetchedDeltas.size() > DELTA_LIMIT;
                        List<SyncDelta> baseDeltas = sanitizeDeltas(hasMore
                                        ? fetchedDeltas.subList(0, DELTA_LIMIT)
                                        : fetchedDeltas);
                        List<SyncDelta> deltas = expandOrderedSiblingDeltasFromSnapshot(
                                        ownerId,
                                        baseDeltas,
                                        highWaterChangeId,
                                        allowedEntityTypes);
                        String responseCursor = String.valueOf(highWaterChangeId);
                        if (hasMore && !baseDeltas.isEmpty()) {
                                SyncDelta lastDelta = baseDeltas.get(baseDeltas.size() - 1);
                                responseCursor = snapshotCursor(
                                                highWaterChangeId,
                                                lastDelta.entityType(),
                                                lastDelta.entityId());
                        }
                        return new SyncResponse(List.of(), responseCursor, deltas, hasMore);
                }

                List<SyncDelta> fetchedDeltas = syncRepository.fetchDeltasForOwner(
                                ownerId,
                                parsedCursor.numericValue(),
                                DELTA_LIMIT + 1,
                                allowedEntityTypes);
                boolean hasMore = fetchedDeltas.size() > DELTA_LIMIT;
                List<SyncDelta> baseDeltas = sanitizeDeltas(hasMore
                                ? fetchedDeltas.subList(0, DELTA_LIMIT)
                                : fetchedDeltas);
                String responseCursor = requestCursor;
                if (!baseDeltas.isEmpty()) {
                        responseCursor = String.valueOf(baseDeltas.get(baseDeltas.size() - 1).changeId());
                }
                long expansionChangeId = baseDeltas.isEmpty()
                                ? parsedCursor.numericValue()
                                : baseDeltas.get(baseDeltas.size() - 1).changeId();
                List<SyncDelta> deltas = expandOrderedSiblingDeltas(ownerId, baseDeltas, expansionChangeId);
                return new SyncResponse(List.of(), responseCursor, deltas, hasMore);
        }

        private List<SyncDelta> expandOrderedSiblingDeltas(
                        String ownerId,
                        List<SyncDelta> baseDeltas,
                        long expansionChangeId) {
                if (baseDeltas.isEmpty()) {
                        return baseDeltas;
                }

                Set<SyncRepository.OrderedSiblingGroup> groups = collectOrderedSiblingGroups(baseDeltas);
                if (groups.isEmpty()) {
                        return baseDeltas;
                }

                List<SyncDelta> siblingSnapshots = syncRepository.fetchActiveOrderedSiblingSnapshotsForOwner(
                                ownerId,
                                groups,
                                expansionChangeId);
                return mergeBaseDeltasWithSiblingSnapshots(baseDeltas, siblingSnapshots);
        }

        private List<SyncDelta> expandOrderedSiblingDeltasFromSnapshot(
                        String ownerId,
                        List<SyncDelta> baseDeltas,
                        long snapshotChangeId,
                        List<String> allowedEntityTypes) {
                if (baseDeltas.isEmpty()) {
                        return baseDeltas;
                }

                Set<SyncRepository.OrderedSiblingGroup> groups = collectOrderedSiblingGroups(baseDeltas);
                if (groups.isEmpty()) {
                        return baseDeltas;
                }

                List<SyncDelta> siblingSnapshots = syncRepository.fetchActiveOrderedSiblingSnapshotsForOwnerAtSnapshot(
                                ownerId,
                                groups,
                                snapshotChangeId,
                                allowedEntityTypes);
                return mergeBaseDeltasWithSiblingSnapshots(baseDeltas, siblingSnapshots);
        }

        private List<SyncDelta> mergeBaseDeltasWithSiblingSnapshots(
                        List<SyncDelta> baseDeltas,
                        List<SyncDelta> siblingSnapshots) {
                if (siblingSnapshots.isEmpty()) {
                        return baseDeltas;
                }
                Map<DeltaKey, SyncDelta> merged = new LinkedHashMap<>();
                for (SyncDelta delta : baseDeltas) {
                        merged.put(new DeltaKey(delta.entityType(), delta.entityId()), delta);
                }
                for (SyncDelta delta : siblingSnapshots) {
                        merged.putIfAbsent(new DeltaKey(delta.entityType(), delta.entityId()), delta);
                }
                return new ArrayList<>(merged.values());
        }

        private Set<SyncRepository.OrderedSiblingGroup> collectOrderedSiblingGroups(List<SyncDelta> deltas) {
                Set<SyncRepository.OrderedSiblingGroup> groups = new HashSet<>();
                for (SyncDelta delta : deltas) {
                        if (!"upsert".equalsIgnoreCase(delta.opType())) {
                                continue;
                        }
                        if (hasTombstone(delta.payload())) {
                                continue;
                        }
                        OrderedEntityConfig orderedConfig = ORDERED_ENTITY_CONFIGS.get(delta.entityType());
                        if (orderedConfig == null) {
                                continue;
                        }
                        String parentId = getText(delta.payload(), orderedConfig.parentField());
                        if (parentId == null) {
                                continue;
                        }
                        groups.add(new SyncRepository.OrderedSiblingGroup(
                                        delta.entityType(),
                                        orderedConfig.parentField(),
                                        parentId));
                }
                return groups;
        }

        private void enforceOwnership(String ownerId, SyncOp op) {
                Optional<String> existingOwner = syncRepository.findEntityOwnerIdForOwner(ownerId, op.entityType(),
                                op.entityId());
                if (existingOwner.isPresent()) {
                        throw new ForbiddenException(
                                        "SYNC_FORBIDDEN",
                                        "Entity ownership mismatch",
                                        Map.of(
                                                        "entityType", op.entityType(),
                                                        "entityId", op.entityId()));
                }
        }

        private List<SyncDelta> sanitizeDeltas(List<SyncDelta> deltas) {
                List<SyncDelta> sanitized = new ArrayList<>(deltas.size());
                for (SyncDelta delta : deltas) {
                        if ("device_token".equals(delta.entityType())) {
                                continue;
                        }
                        if (!"app_meta".equals(delta.entityType())) {
                                sanitized.add(delta);
                                continue;
                        }
                        Map<String, Object> payload = delta.payload();
                        if (payload == null || payload.isEmpty()) {
                                sanitized.add(delta);
                                continue;
                        }
                        Map<String, Object> filtered = new LinkedHashMap<>(payload);
                        APP_META_DENYLIST.forEach(filtered::remove);
                        sanitized.add(new SyncDelta(
                                        delta.changeId(),
                                        delta.entityType(),
                                        delta.entityId(),
                                        delta.opType(),
                                        filtered));
                }
                return sanitized;
        }

        private ResolutionResult resolveConflict(
                        String ownerId,
                        SyncOp op,
                        String opType,
                        Map<String, Object> existingPayload,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt,
                        PreRequestWorkoutCompletionState preRequestWorkoutCompletionState) {
                Map<String, Object> incomingPayload = ensureEntityId(op.payload(), op.entityId());

                Instant incomingUpdatedAt = parseInstant(incomingPayload, "updated_at", "updatedAt");
                Instant incomingDeletedAt = parseInstant(incomingPayload, "deleted_at", "deletedAt");
                Instant existingUpdatedAt = parseInstant(existingPayload, "updated_at", "updatedAt");
                Instant existingDeletedAt = parseInstant(existingPayload, "deleted_at", "deletedAt");

                if (opType.equals("delete")) {
                        Map<String, Object> deletePayload = ensureDeletePayload(incomingPayload, incomingDeletedAt,
                                        incomingUpdatedAt);
                        return resolveDelete(ownerId, op, existingPayload, existingDeletedAt, existingUpdatedAt,
                                        existingReceivedAt,
                                        incomingReceivedAt, deletePayload);
                }

                if (existingDeletedAt != null) {
                        return new ResolutionResult("noop", "delete wins (no resurrection)", null);
                }

                if (existingPayload == null) {
                        enforceImmutability(op, null, incomingPayload, preRequestWorkoutCompletionState);
                        return new ResolutionResult("applied", null, incomingPayload);
                }

                int compare = compareByLww(existingPayload, incomingPayload,
                                capClientUpdatedAtForLww(existingUpdatedAt, existingReceivedAt),
                                capClientUpdatedAtForLww(incomingUpdatedAt, incomingReceivedAt),
                                existingReceivedAt, incomingReceivedAt);
                if (compare > 0) {
                        enforceImmutability(op, existingPayload, incomingPayload, preRequestWorkoutCompletionState);
                        return new ResolutionResult("applied", null, incomingPayload);
                }

                return new ResolutionResult("noop", compare == 0 ? "conflict tie resolved to existing" : "stale update",
                                null);
        }

        private ResolutionResult resolveDelete(
                        String ownerId,
                        SyncOp op,
                        Map<String, Object> existingPayload,
                        Instant existingDeletedAt,
                        Instant existingUpdatedAt,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt,
                        Map<String, Object> deletePayload) {
                if (existingPayload == null) {
                        return new ResolutionResult("applied", null, deletePayload);
                }

                if (existingDeletedAt != null) {
                        int compareDelete = compareDelete(existingPayload, deletePayload, existingDeletedAt,
                                        parseInstant(deletePayload, "deleted_at", "deletedAt"), existingReceivedAt,
                                        incomingReceivedAt);
                        if (compareDelete > 0) {
                                return new ResolutionResult("applied", null,
                                                mergeDelete(existingPayload, deletePayload));
                        }
                        return new ResolutionResult("noop", "delete already applied", null);
                }

                Instant incomingUpdatedAt = parseInstant(deletePayload, "updated_at", "updatedAt");
                int compare = compareByLww(existingPayload, deletePayload,
                                capClientUpdatedAtForLww(existingUpdatedAt, existingReceivedAt),
                                capClientUpdatedAtForLww(incomingUpdatedAt, incomingReceivedAt),
                                existingReceivedAt, incomingReceivedAt);
                if (compare <= 0) {
                        return new ResolutionResult("noop",
                                        compare == 0 ? "conflict tie resolved to existing" : "stale delete",
                                        null);
                }

                return new ResolutionResult("applied", null, mergeDelete(existingPayload, deletePayload));
        }

        private void enforceImmutability(
                        SyncOp op,
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload,
                        PreRequestWorkoutCompletionState preRequestWorkoutCompletionState) {
                if ("delete".equals(op.opType().toLowerCase())) {
                        return;
                }
                if (op.entityType().equals("workout_session")) {
                        if (preRequestWorkoutCompletionState.isCompleted(op.entityId())
                                        && hasMutableChanges(existingPayload, incomingPayload)) {
                                throw immutableConflict(op, "workout_session immutable after completion");
                        }
                }

                if (op.entityType().equals("workout_session_exercise")) {
                        String sessionId = getText(incomingPayload, "workout_session_id");
                        if (sessionId == null) {
                                sessionId = getText(existingPayload, "workout_session_id");
                        }
                        if (sessionId != null
                                        && preRequestWorkoutCompletionState.isCompleted(sessionId)
                                        && hasMutableChanges(existingPayload, incomingPayload)) {
                                throw immutableConflict(op,
                                                "workout_session_exercise immutable when session completed");
                        }
                }

                if (op.entityType().equals("workout_set")) {
                        String sessionId = resolveWorkoutSessionId(
                                        op,
                                        existingPayload,
                                        incomingPayload,
                                        preRequestWorkoutCompletionState);
                        if (sessionId != null
                                        && preRequestWorkoutCompletionState.isCompleted(sessionId)
                                        && hasMutableChanges(existingPayload, incomingPayload)) {
                                throw immutableConflict(op, "workout_set immutable when session completed");
                        }
                }
        }

        private String resolveWorkoutSessionId(
                        SyncOp op,
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload,
                        PreRequestWorkoutCompletionState preRequestWorkoutCompletionState) {
                String wseId = getText(incomingPayload, "workout_session_exercise_id");
                if (wseId == null) {
                        wseId = getText(existingPayload, "workout_session_exercise_id");
                }
                if (wseId == null) {
                        wseId = preRequestWorkoutCompletionState.sessionExerciseIdBySetId().get(op.entityId());
                }
                if (wseId == null) {
                        return null;
                }
                return preRequestWorkoutCompletionState.sessionIdBySessionExerciseId().get(wseId);
        }

        private ConflictException immutableConflict(SyncOp op, String message) {
                return new ConflictException(
                                message,
                                buildDetails(op, "payload", message));
        }

        private boolean hasMutableChanges(Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload) {
                if (incomingPayload == null) {
                        return false;
                }
                if (existingPayload == null) {
                        return true;
                }
                for (String field : incomingPayload.keySet()) {
                        if ("deleted_at".equals(field) || "deletedAt".equals(field)) {
                                continue;
                        }
                        Object incomingValue = incomingPayload.get(field);
                        Object existingValue = existingPayload.get(field);
                        if (!Objects.equals(existingValue, incomingValue)) {
                                return true;
                        }
                }
                return false;
        }

        private int compareByLww(
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload,
                        Instant existingUpdatedAt,
                        Instant incomingUpdatedAt,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt) {
                if (incomingUpdatedAt != null && existingUpdatedAt != null) {
                        int cmp = incomingUpdatedAt.compareTo(existingUpdatedAt);
                        if (cmp != 0) {
                                return cmp;
                        }
                } else if (incomingUpdatedAt != null) {
                        return 1;
                } else if (existingUpdatedAt != null) {
                        return -1;
                }

                String incomingDevice = getText(incomingPayload, "last_modified_by_device_id");
                String existingDevice = getText(existingPayload, "last_modified_by_device_id");
                if (incomingDevice != null && existingDevice != null && !incomingDevice.equals(existingDevice)) {
                        return incomingDevice.compareTo(existingDevice);
                }

                Instant existingTie = existingReceivedAt != null ? existingReceivedAt : Instant.EPOCH;
                Instant incomingTie = incomingReceivedAt != null ? incomingReceivedAt : Instant.EPOCH;
                return incomingTie.compareTo(existingTie);
        }

        private Instant capClientUpdatedAtForLww(Instant clientUpdatedAt, Instant receivedAt) {
                if (clientUpdatedAt == null || receivedAt == null) {
                        return clientUpdatedAt;
                }
                Instant maxAllowedUpdatedAt = receivedAt.plus(CLIENT_UPDATED_AT_ALLOWED_FUTURE_SKEW);
                return clientUpdatedAt.isAfter(maxAllowedUpdatedAt) ? maxAllowedUpdatedAt : clientUpdatedAt;
        }

        private int compareDelete(
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload,
                        Instant existingDeletedAt,
                        Instant incomingDeletedAt,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt) {
                if (incomingDeletedAt != null && existingDeletedAt != null) {
                        int cmp = incomingDeletedAt.compareTo(existingDeletedAt);
                        if (cmp != 0) {
                                return cmp;
                        }
                } else if (incomingDeletedAt != null) {
                        return 1;
                } else if (existingDeletedAt != null) {
                        return -1;
                }

                String incomingDevice = getText(incomingPayload, "last_modified_by_device_id");
                String existingDevice = getText(existingPayload, "last_modified_by_device_id");
                if (incomingDevice != null && existingDevice != null && !incomingDevice.equals(existingDevice)) {
                        return incomingDevice.compareTo(existingDevice);
                }

                Instant existingTie = existingReceivedAt != null ? existingReceivedAt : Instant.EPOCH;
                Instant incomingTie = incomingReceivedAt != null ? incomingReceivedAt : Instant.EPOCH;
                return incomingTie.compareTo(existingTie);
        }

        private Map<String, Object> ensureEntityId(Map<String, Object> payload, String entityId) {
                if (payload == null) {
                        Map<String, Object> node = new LinkedHashMap<>();
                        node.put("id", entityId);
                        return node;
                }
                Object existingId = payload.get("id");
                if (existingId != null) {
                        return payload;
                }
                Map<String, Object> copy = new LinkedHashMap<>(payload);
                copy.put("id", entityId);
                return copy;
        }

        private Map<String, Object> ensureDeletePayload(Map<String, Object> payload, Instant deletedAt,
                        Instant updatedAt) {
                Map<String, Object> copy = payload == null
                                ? new LinkedHashMap<>()
                                : new LinkedHashMap<>(payload);
                Instant now = Instant.now();
                Instant finalDeletedAt = deletedAt != null ? deletedAt : now;
                Instant finalUpdatedAt = updatedAt != null ? updatedAt : finalDeletedAt;
                copy.put("deleted_at", finalDeletedAt.toString());
                copy.put("updated_at", finalUpdatedAt.toString());
                return copy;
        }

        private Map<String, Object> mergeDelete(Map<String, Object> existingPayload,
                        Map<String, Object> deletePayload) {
                if (existingPayload == null) {
                        return deletePayload;
                }
                Map<String, Object> merged = new LinkedHashMap<>(existingPayload);
                merged.put("deleted_at", deletePayload.get("deleted_at"));
                merged.put("updated_at", deletePayload.get("updated_at"));
                return merged;
        }

        private Instant parseInstant(Map<String, Object> payload, String field, String altField) {
                if (payload == null) {
                        return null;
                }
                Object valueObj = payload.get(field);
                if (valueObj == null && altField != null) {
                        valueObj = payload.get(altField);
                }
                if (valueObj == null) {
                        return null;
                }
                String value = valueObj.toString();
                if (value == null || value.isBlank()) {
                        return null;
                }
                try {
                        return Instant.parse(value);
                } catch (Exception ex) {
                        try {
                                return java.time.LocalDateTime
                                                .parse(value, java.time.format.DateTimeFormatter
                                                                .ofPattern("yyyy-MM-dd HH:mm:ss"))
                                                .toInstant(java.time.ZoneOffset.UTC);
                        } catch (Exception ignored) {
                                return null;
                        }
                }
        }

        private String getText(Map<String, Object> payload, String field) {
                if (payload == null) {
                        return null;
                }
                Object valueObj = payload.get(field);
                if (valueObj == null) {
                        return null;
                }
                String value = valueObj.toString();
                return value == null || value.isBlank() ? null : value;
        }

        private record ResolutionResult(String status, String reason, Map<String, Object> payload) {
        }

        private record ParentReference(String field, String parentEntityType, boolean exerciseReference) {
        }

        private record OrderedEntityConfig(String parentField) {
        }

        private record DeltaKey(String entityType, String entityId) {
        }

        private record IndexedSyncOp(int originalIndex, SyncOp op) {
        }

        private record SyncOpPlan(
                        int originalIndex,
                        SyncOp op,
                        String opType,
                        ResolutionResult resolution,
                        boolean duplicate) {
        }

        private record PreRequestWorkoutCompletionState(
                        Set<String> completedSessionIds,
                        Map<String, String> sessionIdBySessionExerciseId,
                        Map<String, String> sessionExerciseIdBySetId) {
                boolean isCompleted(String sessionId) {
                        return sessionId != null && completedSessionIds.contains(sessionId);
                }
        }

        private ParsedCursor parseCursorOrThrow(String cursor, List<String> allowedEntityTypes) {
                if (cursor == null || cursor.isBlank()) {
                        return ParsedCursor.fresh();
                }
                if (cursor.startsWith(SNAPSHOT_CURSOR_PREFIX)) {
                        return parseSnapshotCursorOrThrow(cursor, allowedEntityTypes);
                }
                try {
                        long parsed = Long.parseLong(cursor);
                        if (parsed < 0) {
                                throw invalidCursor("cursor must be a non-negative numeric value");
                        }
                        return ParsedCursor.incremental(parsed);
                } catch (NumberFormatException ex) {
                        throw invalidCursor("cursor must be a numeric value or snapshot cursor");
                }
        }

        private ParsedCursor parseSnapshotCursorOrThrow(String cursor, List<String> allowedEntityTypes) {
                String[] parts = cursor.split(":", 4);
                if (parts.length != 4) {
                        throw invalidCursor("snapshot cursor is malformed");
                }
                long highWaterChangeId;
                try {
                        highWaterChangeId = Long.parseLong(parts[1]);
                } catch (NumberFormatException ex) {
                        throw invalidCursor("snapshot cursor high-water mark must be numeric");
                }
                if (highWaterChangeId < 0) {
                        throw invalidCursor("snapshot cursor high-water mark must be non-negative");
                }
                String entityType = parts[2];
                String entityId = parts[3];
                if (!allowedEntityTypes.contains(entityType) || entityId == null || entityId.isBlank()) {
                        throw invalidCursor("snapshot cursor sort key is invalid");
                }
                return ParsedCursor.snapshot(highWaterChangeId, entityType, entityId);
        }

        private ValidationException invalidCursor(String reason) {
                return new ValidationException(
                                "Invalid cursor value",
                                Map.of(
                                                "opId", "unknown",
                                                "field", "cursor",
                                                "reason", reason));
        }

        private String snapshotCursor(long highWaterChangeId, String entityType, String entityId) {
                return SNAPSHOT_CURSOR_PREFIX + highWaterChangeId + ":" + entityType + ":" + entityId;
        }

        private List<SyncOp> validateAndCanonicalizeOps(List<SyncOp> ops, List<String> allowedEntityTypes) {
                if (ops == null) {
                        throw new ValidationException(
                                        "Invalid sync request",
                                        Map.of(
                                                        "opId", "unknown",
                                                        "field", "ops",
                                                        "reason", "ops must not be null"));
                }
                List<SyncOp> canonicalOps = new ArrayList<>(ops.size());
                for (SyncOp op : ops) {
                        canonicalOps.add(validateAndCanonicalizeOp(op, allowedEntityTypes));
                }
                return canonicalOps;
        }

        private enum CursorMode {
                INCREMENTAL,
                SNAPSHOT
        }

        private record ParsedCursor(
                        CursorMode mode,
                        long numericValue,
                        long snapshotHighWaterChangeId,
                        String snapshotAfterEntityType,
                        String snapshotAfterEntityId) {
                static ParsedCursor fresh() {
                        return incremental(0L);
                }

                static ParsedCursor incremental(long cursor) {
                        return new ParsedCursor(CursorMode.INCREMENTAL, cursor, 0L, null, null);
                }

                static ParsedCursor snapshot(long highWaterChangeId, String afterEntityType, String afterEntityId) {
                        return new ParsedCursor(CursorMode.SNAPSHOT, 0L, highWaterChangeId, afterEntityType,
                                        afterEntityId);
                }
        }

        private SyncOp validateAndCanonicalizeOp(SyncOp op, List<String> allowedEntityTypes) {
                if (op == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        Map.of(
                                                        "opId", "unknown",
                                                        "reason", "op must not be null"));
                }
                String opId = normalizeValue(op.opId());
                validateStringLength(op, "op_id", opId);
                if (opId == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "op_id", "op_id must not be blank"));
                }
                String entityType = normalizeValue(op.entityType());
                validateStringLength(op, "entity_type", entityType);
                if (entityType == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "entity_type", "entity_type must not be blank"));
                }
                if (!allowedEntityTypes.contains(entityType)) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "entity_type", "unsupported entity type"));
                }
                String entityId = normalizeValue(op.entityId());
                validateStringLength(op, "entity_id", entityId);
                if (entityId == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "entity_id", "entity_id must not be blank"));
                }
                String opType = normalizeValue(op.opType());
                validateStringLength(op, "op_type", opType);
                if (opType == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "op_type", "op_type must not be blank"));
                }
                String normalizedOpType = opType.toLowerCase();
                if (!normalizedOpType.equals("upsert") && !normalizedOpType.equals("delete")) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "op_type", "unsupported op type"));
                }
                if (op.payload() == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "payload", "payload must not be null"));
                }
                validatePayloadShape(op);
                Map<String, Object> canonicalPayload = canonicalizePayload(op, entityType, entityId);
                SyncOp canonicalOp = new SyncOp(opId, entityType, entityId, normalizedOpType, canonicalPayload,
                                op.clientTime());
                validatePayloadEntityId(canonicalOp, entityId);
                if (normalizedOpType.equals("delete")) {
                        validateDeletePayload(canonicalOp);
                } else {
                        validateUpsertPayload(canonicalOp);
                }
                return canonicalOp;
        }

        private void validatePayloadShape(SyncOp op) {
                int payloadBytes = serializedPayloadBytes(op);
                if (payloadBytes > syncGuardrailsProperties.getMaxPayloadBytes()) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "payload", "payload exceeds max allowed serialized size"));
                }
                validateJsonValue(op, "payload", op.payload(), 1);
                for (Map.Entry<String, Object> entry : op.payload().entrySet()) {
                        if (!isScalar(entry.getValue())) {
                                throw new ValidationException(
                                                "Invalid sync operation",
                                                buildDetails(op, "payload." + entry.getKey(),
                                                                "payload values must be scalar"));
                        }
                }
        }

        private int serializedPayloadBytes(SyncOp op) {
                try {
                        return objectMapper.writeValueAsString(op.payload()).getBytes(StandardCharsets.UTF_8).length;
                } catch (Exception ex) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "payload", "payload must be serializable JSON"));
                }
        }

        @SuppressWarnings("unchecked")
        private void validateJsonValue(SyncOp op, String field, Object value, int depth) {
                if (depth > syncGuardrailsProperties.getMaxJsonDepth()) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, field, "payload exceeds max JSON depth"));
                }
                if (value instanceof String stringValue) {
                        validateStringLength(op, field, stringValue);
                        return;
                }
                if (value instanceof Map<?, ?> mapValue) {
                        for (Map.Entry<?, ?> entry : mapValue.entrySet()) {
                                if (entry.getKey() instanceof String key) {
                                        validateStringLength(op, field + "." + key, key);
                                        validateJsonValue(op, field + "." + key, entry.getValue(), depth + 1);
                                } else {
                                        throw new ValidationException(
                                                        "Invalid sync operation",
                                                        buildDetails(op, field, "payload object keys must be strings"));
                                }
                        }
                        return;
                }
                if (value instanceof List<?> listValue) {
                        for (int i = 0; i < listValue.size(); i += 1) {
                                validateJsonValue(op, field + "[" + i + "]", listValue.get(i), depth + 1);
                        }
                        return;
                }
                if (!isScalar(value)) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, field, "payload contains unsupported JSON value"));
                }
        }

        private boolean isScalar(Object value) {
                return value == null || value instanceof String || value instanceof Number || value instanceof Boolean;
        }

        private void validateStringLength(SyncOp op, String field, String value) {
                if (value != null && value.length() > syncGuardrailsProperties.getMaxStringLength()) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, field, "string exceeds max allowed length"));
                }
        }

        private Map<String, Object> canonicalizePayload(SyncOp op, String entityType, String entityId) {
                Set<String> allowedFields = ALLOWED_PAYLOAD_FIELDS.get(entityType);
                if (allowedFields == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "entity_type", "unsupported entity type"));
                }
                Map<String, Object> source = new LinkedHashMap<>(op.payload());
                copyTimestampAlias(source, "updatedAt", "updated_at");
                copyTimestampAlias(source, "deletedAt", "deleted_at");
                Map<String, Object> canonical = new LinkedHashMap<>();
                for (Map.Entry<String, Object> entry : source.entrySet()) {
                        if (allowedFields.contains(entry.getKey())) {
                                canonical.put(entry.getKey(), entry.getValue());
                        }
                }
                canonical.putIfAbsent("id", entityId);
                return canonical;
        }

        private void copyTimestampAlias(Map<String, Object> payload, String alias, String canonicalField) {
                Object aliasValue = payload.get(alias);
                if (aliasValue != null && !payload.containsKey(canonicalField)) {
                        payload.put(canonicalField, aliasValue);
                }
        }

        private void validatePayloadEntityId(SyncOp op, String entityId) {
                Object payloadId = op.payload().get("id");
                if (payloadId == null) {
                        return;
                }

                String normalizedPayloadId = normalizeValue(payloadId.toString());
                // The transport entityId is the row key used for ownership, ledger, and storage.
                // If payload.id disagrees, clients would later materialize a different logical row.
                if (!entityId.equals(normalizedPayloadId)) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "payload.id", "payload.id must match entity_id"));
                }
        }

        private void validateDeletePayload(SyncOp op) {
                Object deletedAt = op.payload().get("deleted_at");
                if (deletedAt == null) {
                        deletedAt = op.payload().get("deletedAt");
                }
                if (deletedAt == null || deletedAt.toString().isBlank()) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "deleted_at", "deleted_at is required for delete"));
                }
                Instant parsedDeletedAt = parseInstant(op.payload(), "deleted_at", "deletedAt");
                if (parsedDeletedAt == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "deleted_at",
                                                        "deleted_at must be an ISO-8601 or SQLite timestamp"));
                }
        }

        private void validateUpsertPayload(SyncOp op) {
                Object updatedAt = op.payload().get("updated_at");
                if (updatedAt == null) {
                        updatedAt = op.payload().get("updatedAt");
                }
                if (updatedAt != null && parseInstant(op.payload(), "updated_at", "updatedAt") == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "updated_at",
                                                        "updated_at must be an ISO-8601 or SQLite timestamp"));
                }

                Object deletedAt = op.payload().get("deleted_at");
                if (deletedAt == null) {
                        deletedAt = op.payload().get("deletedAt");
                }
                if (deletedAt != null && parseInstant(op.payload(), "deleted_at", "deletedAt") == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "deleted_at",
                                                        "deleted_at must be an ISO-8601 or SQLite timestamp"));
                }
        }

        private Map<String, Object> buildDetails(SyncOp op, String field, String reason) {
                Map<String, Object> details = new LinkedHashMap<>();
                String opId = normalizeValue(op.opId());
                details.put("opId", opId == null ? "unknown" : opId);
                String entityType = normalizeValue(op.entityType());
                if (entityType != null) {
                        details.put("entityType", entityType);
                }
                String opType = normalizeValue(op.opType());
                if (opType != null) {
                        details.put("opType", opType);
                }
                details.put("field", field);
                details.put("reason", reason);
                return details;
        }

        private String normalizeValue(String value) {
                if (value == null) {
                        return null;
                }
                String trimmed = value.trim();
                return trimmed.isEmpty() ? null : trimmed;
        }
}
