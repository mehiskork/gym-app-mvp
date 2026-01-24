package com.gymapp.backend.model;

import com.fasterxml.jackson.databind.JsonNode;

public record SyncDelta(
        long changeId,
        String entityType,
        String entityId,
        String opType,
        JsonNode payload) {
}