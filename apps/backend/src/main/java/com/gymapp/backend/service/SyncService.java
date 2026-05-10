package com.gymapp.backend.service;

import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SyncService {
        private static final int DELTA_LIMIT = 1000;
        private static final String SNAPSHOT_CURSOR_PREFIX = "snapshot:";
        private static final Set<String> APP_META_DENYLIST = Set.of(
                        "access_token",
                        "auth_token",
                        "device_token",
                        "refresh_token",
                        "secret",
                        "token");
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

        private final SyncRepository syncRepository;
        private final AccountDeletionRepository accountDeletionRepository;

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

                validateOps(ops, allowedEntityTypes);
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
                Set<SyncRepository.EntityKey> appliedActiveKeys = new HashSet<>();
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
                                                plannedStateByKey)));

                return plans;
        }

        private SyncOpPlan buildCandidatePlan(
                        String ownerId,
                        IndexedSyncOp indexed,
                        Instant receivedAt,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityPresence> existingParentPresence,
                        Set<SyncRepository.EntityKey> foreignParentKeys,
                        Set<SyncRepository.EntityKey> appliedActiveKeys,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityStateRecord> plannedStateByKey) {
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
                                receivedAt);

                if ("applied".equals(resolution.status())) {
                        validateParentsForAppliedOp(
                                        op,
                                        opType,
                                        resolution.payload(),
                                        existingParentPresence,
                                        foreignParentKeys,
                                        appliedActiveKeys);
                        plannedStateByKey.put(key, new SyncRepository.EntityStateRecord(resolution.payload(),
                                        receivedAt));
                        if (isActiveUpsert(opType, resolution.payload())) {
                                appliedActiveKeys.add(key);
                        } else {
                                appliedActiveKeys.remove(key);
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

        private void validateParentsForAppliedOp(
                        SyncOp op,
                        String opType,
                        Map<String, Object> payload,
                        Map<SyncRepository.EntityKey, SyncRepository.EntityPresence> existingParentPresence,
                        Set<SyncRepository.EntityKey> foreignParentKeys,
                        Set<SyncRepository.EntityKey> appliedActiveKeys) {
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
                        List<SyncDelta> deltas = sanitizeDeltas(hasMore
                                        ? fetchedDeltas.subList(0, DELTA_LIMIT)
                                        : fetchedDeltas);
                        String responseCursor = String.valueOf(highWaterChangeId);
                        if (hasMore && !deltas.isEmpty()) {
                                SyncDelta lastDelta = deltas.get(deltas.size() - 1);
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
                List<SyncDelta> deltas = sanitizeDeltas(hasMore
                                ? fetchedDeltas.subList(0, DELTA_LIMIT)
                                : fetchedDeltas);
                String responseCursor = requestCursor;
                if (!deltas.isEmpty()) {
                        responseCursor = String.valueOf(deltas.get(deltas.size() - 1).changeId());
                }
                return new SyncResponse(List.of(), responseCursor, deltas, hasMore);
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
                        Instant incomingReceivedAt) {
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
                        ResolutionResult immutability = enforceImmutability(ownerId, op, null, incomingPayload);
                        if (immutability != null) {
                                return immutability;
                        }
                        return new ResolutionResult("applied", null, incomingPayload);
                }

                int compare = compareByLww(existingPayload, incomingPayload, existingUpdatedAt, incomingUpdatedAt,
                                existingReceivedAt, incomingReceivedAt);
                if (compare > 0) {
                        ResolutionResult immutability = enforceImmutability(ownerId, op, existingPayload,
                                        incomingPayload);
                        if (immutability != null) {
                                return immutability;
                        }
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
                int compare = compareByLww(existingPayload, deletePayload, existingUpdatedAt, incomingUpdatedAt,
                                existingReceivedAt, incomingReceivedAt);
                if (compare <= 0) {
                        return new ResolutionResult("noop",
                                        compare == 0 ? "conflict tie resolved to existing" : "stale delete",
                                        null);
                }

                return new ResolutionResult("applied", null, mergeDelete(existingPayload, deletePayload));
        }

        private ResolutionResult enforceImmutability(
                        String ownerId,
                        SyncOp op,
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload) {
                if ("delete".equals(op.opType().toLowerCase())) {
                        return null;
                }
                if (op.entityType().equals("workout_session")) {
                        String status = getText(existingPayload, "status");
                        if ("completed".equals(status)) {
                                if (hasMutableChanges(existingPayload, incomingPayload)) {
                                        return new ResolutionResult("rejected",
                                                        "workout_session immutable after completion", null);
                                }
                        }
                }

                if (op.entityType().equals("workout_set")) {
                        String sessionId = resolveWorkoutSessionId(ownerId, existingPayload, incomingPayload);
                        if (sessionId != null) {
                                Optional<Map<String, Object>> sessionPayload = syncRepository.findEntityStateForOwner(
                                                ownerId,
                                                "workout_session",
                                                sessionId);
                                if (sessionPayload.isPresent()
                                                && "completed".equals(getText(sessionPayload.get(), "status"))) {
                                        if (hasMutableChanges(existingPayload, incomingPayload)) {
                                                return new ResolutionResult("rejected",
                                                                "workout_set immutable when session completed",
                                                                null);
                                        }
                                }
                        }
                }

                return null;
        }

        private String resolveWorkoutSessionId(
                        String ownerId,
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload) {
                String wseId = getText(incomingPayload, "workout_session_exercise_id");
                if (wseId == null) {
                        wseId = getText(existingPayload, "workout_session_exercise_id");
                }
                if (wseId == null) {
                        return null;
                }
                Optional<Map<String, Object>> wsePayload = syncRepository.findEntityStateForOwner(
                                ownerId,
                                "workout_session_exercise",
                                wseId);
                return wsePayload.map(node -> getText(node, "workout_session_id")).orElse(null);
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

        private record IndexedSyncOp(int originalIndex, SyncOp op) {
        }

        private record SyncOpPlan(
                        int originalIndex,
                        SyncOp op,
                        String opType,
                        ResolutionResult resolution,
                        boolean duplicate) {
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

        private void validateOps(List<SyncOp> ops, List<String> allowedEntityTypes) {
                if (ops == null) {
                        throw new ValidationException(
                                        "Invalid sync request",
                                        Map.of(
                                                        "opId", "unknown",
                                                        "field", "ops",
                                                        "reason", "ops must not be null"));
                }
                for (SyncOp op : ops) {
                        validateOp(op, allowedEntityTypes);
                }
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

        private void validateOp(SyncOp op, List<String> allowedEntityTypes) {
                if (op == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        Map.of(
                                                        "opId", "unknown",
                                                        "reason", "op must not be null"));
                }
                String opId = normalizeValue(op.opId());
                if (opId == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "op_id", "op_id must not be blank"));
                }
                String entityType = normalizeValue(op.entityType());
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
                if (entityId == null) {
                        throw new ValidationException(
                                        "Invalid sync operation",
                                        buildDetails(op, "entity_id", "entity_id must not be blank"));
                }
                String opType = normalizeValue(op.opType());
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
                validatePayloadEntityId(op, entityId);
                if (normalizedOpType.equals("delete")) {
                        validateDeletePayload(op);
                } else {
                        validateUpsertPayload(op);
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
