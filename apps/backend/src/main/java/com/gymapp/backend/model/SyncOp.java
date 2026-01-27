package com.gymapp.backend.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record SyncOp(
        @NotBlank String opId,
        @NotBlank String entityType,
        @NotBlank String entityId,
        @NotBlank String opType,
        @NotNull Map<String, Object> payload,
        String clientTime) {
}