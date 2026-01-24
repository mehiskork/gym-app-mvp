package com.gymapp.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SyncService {
    private static final int DELTA_LIMIT = 1000;

    private final DeviceTokenRepository deviceTokenRepository;
    private final DeviceRepository deviceRepository;
    private final SyncRepository syncRepository;

    public SyncService(DeviceTokenRepository deviceTokenRepository,
            DeviceRepository deviceRepository,
            SyncRepository syncRepository) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.deviceRepository = deviceRepository;
        this.syncRepository = syncRepository;
    }

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
                acks.add(new SyncAck(op.opId(), "ok"));
                continue;
            }

            String opType = op.opType().toLowerCase();
            if (!opType.equals("upsert") && !opType.equals("delete")) {
                throw new IllegalArgumentException("Invalid opType: " + op.opType());
            }
            JsonNode payload;
            if (opType.equals("upsert")) {
                syncRepository.upsertEntityState(guestUserId, op.entityType(), op.entityId(), op.payload());
                payload = op.payload();

            } else {
                syncRepository.deleteEntityState(guestUserId, op.entityType(), op.entityId());
                Instant now = Instant.now();
                payload = JsonNodeFactory.instance.objectNode()
                        .put("deleted_at", now.toString())
                        .put("updated_at", now.toString());
            }

            syncRepository.insertOpLedger(op.opId(), deviceId, guestUserId);
            syncRepository.insertChangeLog(guestUserId, op.entityType(), op.entityId(), opType, payload);
            acks.add(new SyncAck(op.opId(), "ok"));
        }

        long parsedCursor = parseCursor(cursor);

        List<SyncDelta> deltas = syncRepository.fetchDeltas(guestUserId, parsedCursor, DELTA_LIMIT, allowedEntityTypes);
        long newCursor = syncRepository.fetchMaxChangeId(guestUserId, parsedCursor, DELTA_LIMIT);

        return new SyncResponse(acks, String.valueOf(newCursor), deltas);
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