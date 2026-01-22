package com.gymapp.backend.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record SyncRequest(
        String cursor,
        @NotNull @Valid List<SyncOp> ops) {
}