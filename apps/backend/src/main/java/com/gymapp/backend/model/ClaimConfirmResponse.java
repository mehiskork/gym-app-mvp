package com.gymapp.backend.model;

public record ClaimConfirmResponse(
        String guestUserId,
        String userId,
        String status) {
}