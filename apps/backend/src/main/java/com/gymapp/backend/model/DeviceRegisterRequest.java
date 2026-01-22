package com.gymapp.backend.model;

import jakarta.validation.constraints.NotBlank;

public record DeviceRegisterRequest(
        @NotBlank String deviceId,
        @NotBlank String deviceSecret) {
}