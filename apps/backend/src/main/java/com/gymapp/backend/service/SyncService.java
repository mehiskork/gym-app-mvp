package com.gymapp.backend.service;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SyncService {
        private static final int DELTA_LIMIT = 1000;

        private final DeviceRepository deviceRepository;
        private final SyncRepository syncRepository;

        @Transactional
        public SyncResponse sync(String deviceId, String cursor, List<SyncOp> ops) {

                String guestUserId = deviceRepository.findGuestUserId(deviceId)
                                .orElseThrow(() -> new ForbiddenException("Unknown device"));

                List<SyncAck> acks = new ArrayList<>();
                List<String> allowedEntityTypes = List.copyOf(SyncEntityTypes.ALLOWED_TYPES);

                for (SyncOp op : ops) {
                        if (!allowedEntityTypes.contains(op.entityType())) {
                                throw new ValidationException(
                                                "Unsupported entityType: " + op.entityType(),
                                                Map.of("entityType", op.entityType()));
                        }
                }

                for (SyncOp op : ops) {
                        if (syncRepository.opExists(op.opId())) {

                                acks.add(new SyncAck(op.opId(), "noop", "duplicate op"));
                                continue;
                        }

                        String opType = op.opType().toLowerCase();
                        if (!opType.equals("upsert") && !opType.equals("delete")) {
                                throw new ValidationException(
                                                "Invalid opType: " + op.opType(),
                                                Map.of("opType", op.opType()));
                        }

                        Instant receivedAt = Instant.now();
                        Optional<SyncRepository.EntityStateRecord> existingState = syncRepository
                                        .findEntityStateWithReceivedAt(
                                                        guestUserId,
                                                        op.entityType(),
                                                        op.entityId());
                        Map<String, Object> existingPayload = existingState
                                        .map(SyncRepository.EntityStateRecord::payload)
                                        .orElse(null);
                        Instant existingReceivedAt = existingState.map(SyncRepository.EntityStateRecord::lastReceivedAt)
                                        .orElse(null);

                        ResolutionResult resolution = resolveConflict(
                                        guestUserId,
                                        op,
                                        opType,
                                        existingPayload,
                                        existingReceivedAt,
                                        receivedAt);

                        syncRepository.insertOpLedger(op.opId(), deviceId, guestUserId, receivedAt);

                        if (resolution.status().equals("applied")) {
                                syncRepository.upsertEntityState(guestUserId, op.entityType(), op.entityId(),
                                                resolution.payload(), receivedAt);
                                syncRepository.insertChangeLog(guestUserId, op.entityType(), op.entityId(), opType,
                                                resolution.payload());
                        }

                        acks.add(new SyncAck(op.opId(), resolution.status(), resolution.reason()));
                }

                long parsedCursor = parseCursor(cursor);

                List<SyncDelta> deltas = syncRepository.fetchDeltas(guestUserId, parsedCursor, DELTA_LIMIT,
                                allowedEntityTypes);
                long newCursor = syncRepository.fetchMaxChangeId(guestUserId, parsedCursor, DELTA_LIMIT);

                return new SyncResponse(acks, String.valueOf(newCursor), deltas);
        }

        private ResolutionResult resolveConflict(
                        String guestUserId,
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
                        return resolveDelete(guestUserId, op, existingPayload, existingDeletedAt, existingUpdatedAt,
                                        existingReceivedAt,
                                        incomingReceivedAt, deletePayload);
                }

                if (existingDeletedAt != null) {
                        return new ResolutionResult("noop", "delete wins (no resurrection)", null);
                }

                if (existingPayload == null) {
                        ResolutionResult immutability = enforceImmutability(guestUserId, op, null, incomingPayload);
                        if (immutability != null) {
                                return immutability;
                        }
                        return new ResolutionResult("applied", null, incomingPayload);
                }

                int compare = compareByLww(existingPayload, incomingPayload, existingUpdatedAt, incomingUpdatedAt,
                                existingReceivedAt, incomingReceivedAt);
                if (compare > 0) {
                        ResolutionResult immutability = enforceImmutability(guestUserId, op, existingPayload,
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
                        String guestUserId,
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
                        String guestUserId,
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
                        String sessionId = resolveWorkoutSessionId(guestUserId, existingPayload, incomingPayload);
                        if (sessionId != null) {
                                Optional<Map<String, Object>> sessionPayload = syncRepository.findEntityState(
                                                guestUserId,
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
                        String guestUserId,
                        Map<String, Object> existingPayload,
                        Map<String, Object> incomingPayload) {
                String wseId = getText(incomingPayload, "workout_session_exercise_id");
                if (wseId == null) {
                        wseId = getText(existingPayload, "workout_session_exercise_id");
                }
                if (wseId == null) {
                        return null;
                }
                Optional<Map<String, Object>> wsePayload = syncRepository.findEntityState(
                                guestUserId,
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

        private long parseCursor(String cursor) {
                if (cursor == null || cursor.isBlank()) {
                        return 0L;
                }
                try {
                        return Long.parseLong(cursor);
                } catch (NumberFormatException ex) {
                        return 0L;
                }
        }
}