package com.gymapp.backend.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SyncOp(
        @NotBlank String opId,
        @NotBlank String entityType,
        @NotBlank String entityId,
        @NotBlank String opType,
        @NotNull JsonNode payload,
        String clientTime) {
}