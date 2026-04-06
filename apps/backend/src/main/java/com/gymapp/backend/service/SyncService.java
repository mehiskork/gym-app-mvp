package com.gymapp.backend.service;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SyncService {
        private static final int DELTA_LIMIT = 1000;
        private static final Set<String> APP_META_DENYLIST = Set.of(
                        "access_token",
                        "auth_token",
                        "device_token",
                        "refresh_token",
                        "secret",
                        "token");

        private final SyncRepository syncRepository;

        @Transactional
        public SyncResponse sync(String deviceId, String guestUserId, String cursor, List<SyncOp> ops) {
                return sync(deviceId, OwnerScope.guest(guestUserId), cursor, ops);
        }

        @Transactional
        public SyncResponse sync(String deviceId, OwnerScope ownerScope, String cursor, List<SyncOp> ops) {
                String ownerId = ownerScope.getOwnerId();

                if (deviceId == null || deviceId.isBlank()) {
                        throw new ValidationException(
                                        "sync transport context missing device id",
                                        Map.of("field", "deviceId", "ownerType", ownerScope.getType()));
                }

                List<SyncAck> acks = new ArrayList<>();
                List<String> allowedEntityTypes = List.copyOf(SyncEntityTypes.ALLOWED_TYPES);

                long parsedCursor = parseCursorOrThrow(cursor);

                validateOps(ops, allowedEntityTypes);
                Instant requestReceivedAt = Instant.now();

                for (SyncOp op : ops) {
                        String opType = op.opType().toLowerCase();

                        Instant receivedAt = requestReceivedAt;

                        enforceOwnership(ownerId, op);

                        // Atomic dedupe: insert ledger row if absent
                        boolean inserted = syncRepository.insertOpLedgerIfAbsentForOwner(op.opId(), deviceId, ownerId,
                                        receivedAt);
                        if (!inserted) {
                                acks.add(new SyncAck(op.opId(), "noop", "duplicate op"));
                                continue;
                        }

                        Optional<SyncRepository.EntityStateRecord> existingState = syncRepository
                                        .findEntityStateWithReceivedAtForOwner(
                                                        ownerId,
                                                        op.entityType(),
                                                        op.entityId());

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

                        if (resolution.status().equals("applied")) {
                                syncRepository.upsertEntityStateForOwner(
                                                ownerId,
                                                op.entityType(),
                                                op.entityId(),
                                                resolution.payload(),
                                                receivedAt);

                                syncRepository.insertChangeLogForOwner(
                                                ownerId,
                                                op.entityType(),
                                                op.entityId(),
                                                opType,
                                                resolution.payload());
                        }

                        acks.add(new SyncAck(op.opId(), resolution.status(), resolution.reason()));
                }

                List<SyncDelta> fetchedDeltas = syncRepository.fetchDeltasForOwner(
                                ownerId,
                                parsedCursor,
                                DELTA_LIMIT + 1,
                                allowedEntityTypes);
                boolean hasMore = fetchedDeltas.size() > DELTA_LIMIT;
                List<SyncDelta> deltas = sanitizeDeltas(hasMore
                                ? fetchedDeltas.subList(0, DELTA_LIMIT)
                                : fetchedDeltas);
                String responseCursor = cursor;
                if (!deltas.isEmpty()) {
                        responseCursor = String.valueOf(deltas.get(deltas.size() - 1).changeId());
                }

                return new SyncResponse(acks, responseCursor, deltas, hasMore);
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

        private long parseCursorOrThrow(String cursor) {
                if (cursor == null || cursor.isBlank()) {
                        return 0L;
                }
                try {
                        return Long.parseLong(cursor);
                } catch (NumberFormatException ex) {
                        throw new ValidationException(
                                        "Invalid cursor value",
                                        Map.of(
                                                        "opId", "unknown",
                                                        "field", "cursor",
                                                        "reason", "cursor must be a numeric value"));
                }
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
                if (normalizedOpType.equals("delete")) {
                        validateDeletePayload(op);
                } else {
                        validateUpsertPayload(op);
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