package com.gymapp.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncDelta;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.DeviceTokenRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SyncService {
        private static final int DELTA_LIMIT = 1000;

        private final DeviceTokenRepository deviceTokenRepository;
        private final DeviceRepository deviceRepository;
        private final SyncRepository syncRepository;

        @Transactional
        public SyncResponse sync(String deviceToken, String cursor, List<SyncOp> ops) {
                String deviceId = deviceTokenRepository.findDeviceIdByToken(deviceToken)
                                .orElseThrow(() -> new ForbiddenException("Invalid device token"));
                String guestUserId = deviceRepository.findGuestUserId(deviceId)
                                .orElseThrow(() -> new ForbiddenException("Unknown device"));

                List<SyncAck> acks = new ArrayList<>();
                List<String> allowedEntityTypes = List.copyOf(SyncEntityTypes.ALLOWED_TYPES);

                for (SyncOp op : ops) {
                        if (!allowedEntityTypes.contains(op.entityType())) {
                                throw new IllegalArgumentException("Unsupported entityType: " + op.entityType());
                        }
                }

                for (SyncOp op : ops) {
                        if (syncRepository.opExists(op.opId())) {

                                acks.add(new SyncAck(op.opId(), "noop", "duplicate op"));
                                continue;
                        }

                        String opType = op.opType().toLowerCase();
                        if (!opType.equals("upsert") && !opType.equals("delete")) {
                                throw new IllegalArgumentException("Invalid opType: " + op.opType());
                        }

                        Instant receivedAt = Instant.now();
                        Optional<SyncRepository.EntityStateRecord> existingState = syncRepository
                                        .findEntityStateWithReceivedAt(
                                                        guestUserId,
                                                        op.entityType(),
                                                        op.entityId());
                        JsonNode existingPayload = existingState.map(SyncRepository.EntityStateRecord::payload)
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
                        JsonNode existingPayload,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt) {
                JsonNode incomingPayload = ensureEntityId(op.payload(), op.entityId());

                Instant incomingUpdatedAt = parseInstant(incomingPayload, "updated_at", "updatedAt");
                Instant incomingDeletedAt = parseInstant(incomingPayload, "deleted_at", "deletedAt");
                Instant existingUpdatedAt = parseInstant(existingPayload, "updated_at", "updatedAt");
                Instant existingDeletedAt = parseInstant(existingPayload, "deleted_at", "deletedAt");

                if (opType.equals("delete")) {
                        ObjectNode deletePayload = ensureDeletePayload(incomingPayload, incomingDeletedAt,
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
                        JsonNode existingPayload,
                        Instant existingDeletedAt,
                        Instant existingUpdatedAt,
                        Instant existingReceivedAt,
                        Instant incomingReceivedAt,
                        ObjectNode deletePayload) {
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
                        JsonNode existingPayload,
                        JsonNode incomingPayload) {
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
                                Optional<JsonNode> sessionPayload = syncRepository.findEntityState(
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
                        JsonNode existingPayload,
                        JsonNode incomingPayload) {
                String wseId = getText(incomingPayload, "workout_session_exercise_id");
                if (wseId == null) {
                        wseId = getText(existingPayload, "workout_session_exercise_id");
                }
                if (wseId == null) {
                        return null;
                }
                Optional<JsonNode> wsePayload = syncRepository.findEntityState(
                                guestUserId,
                                "workout_session_exercise",
                                wseId);
                return wsePayload.map(node -> getText(node, "workout_session_id")).orElse(null);
        }

        private boolean hasMutableChanges(JsonNode existingPayload, JsonNode incomingPayload) {
                if (incomingPayload == null) {
                        return false;
                }
                if (existingPayload == null) {
                        return true;
                }
                var fields = incomingPayload.fieldNames();
                while (fields.hasNext()) {
                        String field = fields.next();
                        if ("deleted_at".equals(field) || "deletedAt".equals(field)) {
                                continue;
                        }
                        JsonNode incomingValue = incomingPayload.get(field);
                        JsonNode existingValue = existingPayload.get(field);
                        if (existingValue == null || !existingValue.equals(incomingValue)) {
                                return true;
                        }
                }
                return false;
        }

        private int compareByLww(
                        JsonNode existingPayload,
                        JsonNode incomingPayload,
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
                        JsonNode existingPayload,
                        JsonNode incomingPayload,
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

        private JsonNode ensureEntityId(JsonNode payload, String entityId) {
                if (payload == null || payload.isNull()) {
                        ObjectNode node = JsonNodeFactory.instance.objectNode();
                        node.put("id", entityId);
                        return node;
                }
                if (payload.hasNonNull("id")) {
                        return payload;
                }
                ObjectNode copy = payload.deepCopy();
                copy.put("id", entityId);
                return copy;
        }

        private ObjectNode ensureDeletePayload(JsonNode payload, Instant deletedAt, Instant updatedAt) {
                ObjectNode copy = payload == null || payload.isNull()
                                ? JsonNodeFactory.instance.objectNode()
                                : payload.deepCopy();
                Instant now = Instant.now();
                Instant finalDeletedAt = deletedAt != null ? deletedAt : now;
                Instant finalUpdatedAt = updatedAt != null ? updatedAt : finalDeletedAt;
                copy.put("deleted_at", finalDeletedAt.toString());
                copy.put("updated_at", finalUpdatedAt.toString());
                return copy;
        }

        private JsonNode mergeDelete(JsonNode existingPayload, ObjectNode deletePayload) {
                if (existingPayload == null || existingPayload.isNull()) {
                        return deletePayload;
                }
                ObjectNode merged = existingPayload.deepCopy();
                merged.set("deleted_at", deletePayload.get("deleted_at"));
                merged.set("updated_at", deletePayload.get("updated_at"));
                return merged;
        }

        private Instant parseInstant(JsonNode payload, String field, String altField) {
                if (payload == null || payload.isNull()) {
                        return null;
                }
                JsonNode node = payload.get(field);
                if (node == null && altField != null) {
                        node = payload.get(altField);
                }
                if (node == null || node.isNull()) {
                        return null;
                }
                String value = node.asText(null);
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

        private String getText(JsonNode payload, String field) {
                if (payload == null || payload.isNull()) {
                        return null;
                }
                JsonNode node = payload.get(field);
                if (node == null || node.isNull()) {
                        return null;
                }
                String value = node.asText();
                return value == null || value.isBlank() ? null : value;
        }

        private record ResolutionResult(String status, String reason, JsonNode payload) {
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