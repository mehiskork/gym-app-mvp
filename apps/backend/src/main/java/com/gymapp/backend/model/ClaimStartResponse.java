package com.gymapp.backend.model;

import java.time.OffsetDateTime;

public record ClaimStartResponse(
        String claimId,
        String code,
        OffsetDateTime expiresAt) {
}