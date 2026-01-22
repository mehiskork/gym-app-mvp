package com.gymapp.backend.model;

public record DeviceRegisterResponse(
        String deviceToken,
        String guestUserId) {
}