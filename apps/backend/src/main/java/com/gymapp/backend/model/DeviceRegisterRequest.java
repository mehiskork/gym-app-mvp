package com.gymapp.backend.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DeviceRegisterRequest(
        @NotBlank @Size(min = 8, max = 80) @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9_.:-]{7,79}$") String deviceId,
        @NotBlank @Size(min = 16, max = 128) @Pattern(regexp = "^[A-Za-z0-9_.:-]+$") String deviceSecret) {
}
