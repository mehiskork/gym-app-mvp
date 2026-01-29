package com.gymapp.backend.config;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public class DevicePrincipal {
    private final String deviceId;
    private final String guestUserId;
}