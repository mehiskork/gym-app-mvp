package com.gymapp.backend.controller;

import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ClaimDeviceCredentialResolver {
    public static final String DEVICE_AUTHORIZATION_HEADER = "X-Device-Authorization";

    private static final String BEARER_PREFIX = "Bearer ";

    private final DeviceTokenRepository deviceTokenRepository;

    public DevicePrincipal resolve(String deviceAuthorization) {
        if (deviceAuthorization == null || deviceAuthorization.isBlank()) {
            throw new UnauthorizedException("AUTH_DEVICE_TOKEN_REQUIRED", "Device token required", null);
        }
        if (!deviceAuthorization.startsWith(BEARER_PREFIX)) {
            throw new UnauthorizedException("AUTH_DEVICE_TOKEN_MALFORMED", "Malformed device token", null);
        }

        String token = deviceAuthorization.substring(BEARER_PREFIX.length()).trim();
        if (token.isBlank()) {
            throw new UnauthorizedException("AUTH_DEVICE_TOKEN_MALFORMED", "Malformed device token", null);
        }

        DeviceTokenRepository.DeviceTokenLookupResult lookup = deviceTokenRepository.findToken(token, Instant.now());
        if (lookup.status() == DeviceTokenRepository.DeviceTokenStatus.NOT_FOUND) {
            throw new UnauthorizedException("AUTH_INVALID_DEVICE_TOKEN", "Invalid device token", null);
        }
        if (lookup.status() == DeviceTokenRepository.DeviceTokenStatus.EXPIRED) {
            throw new UnauthorizedException("AUTH_TOKEN_EXPIRED", "Expired device token", null);
        }

        return new DevicePrincipal(lookup.deviceId(), lookup.guestUserId());
    }
}
