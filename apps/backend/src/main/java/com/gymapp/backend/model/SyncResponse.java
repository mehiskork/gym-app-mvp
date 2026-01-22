package com.gymapp.backend.model;

import java.util.List;

public record SyncResponse(
        List<SyncAck> acks,
        String cursor,
        List<SyncDelta> deltas) {
}