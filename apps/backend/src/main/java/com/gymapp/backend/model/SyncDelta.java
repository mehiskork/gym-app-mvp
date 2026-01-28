package com.gymapp.backend.model;

import java.util.Map;

public record SyncDelta(
                long changeId,
                String entityType,
                String entityId,
                String opType,
                Map<String, Object> payload) {
}