package com.gymapp.backend.model;

import jakarta.validation.constraints.NotBlank;

public record ClaimConfirmRequest(
        @NotBlank String code) {
}