package com.gymapp.backend.service;

import com.gymapp.backend.controller.BadRequestException;
import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.model.DeviceRegisterResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class DeviceService {
    private static final Duration TOKEN_TTL = Duration.ofDays(30);
    private static final int DEVICE_ID_MIN_LENGTH = 8;
    private static final int DEVICE_ID_MAX_LENGTH = 80;
    private static final int DEVICE_SECRET_MIN_LENGTH = 16;
    private static final int DEVICE_SECRET_MAX_LENGTH = 128;
    private static final Pattern DEVICE_ID_PATTERN = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{7,79}$");
    private static final Pattern DEVICE_SECRET_PATTERN = Pattern.compile("^[A-Za-z0-9_.:-]+$");

    private final DeviceRepository deviceRepository;
    private final DeviceTokenRepository deviceTokenRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${deviceToken.cleanupBatchSize:500}")
    private int tokenCleanupBatchSize;

    @Transactional
    public DeviceRegisterResponse registerDevice(String deviceId, String deviceSecret) {
        validateDeviceCredentialInput(deviceId, deviceSecret);
        Optional<DeviceRepository.DeviceRecord> existing = deviceRepository.findById(deviceId);
        String guestUserId;

        if (existing.isPresent()) {
            DeviceRepository.DeviceRecord record = existing.get();
            if (!passwordEncoder.matches(deviceSecret, record.secretHash())) {
                throw new ForbiddenException("Invalid device secret");
            }
            guestUserId = record.guestUserId();
        } else {
            guestUserId = UUID.randomUUID().toString();
            String secretHash = passwordEncoder.encode(deviceSecret);
            deviceRepository.insertDevice(deviceId, secretHash, guestUserId);
        }

        Instant now = Instant.now();
        int expiredTokensDeleted = deviceTokenRepository.deleteExpiredTokensBatch(now, tokenCleanupBatchSize);
        int deviceTokensDeleted = deviceTokenRepository.deleteTokensByDeviceId(deviceId);

        String deviceToken = UUID.randomUUID().toString();
        String tokenHash = passwordEncoder.encode(deviceToken);
        String tokenFingerprint = DeviceTokenRepository.TokenFingerprintUtils.fingerprint(deviceToken);
        Instant expiresAt = now.plus(TOKEN_TTL);
        deviceTokenRepository.insertToken(tokenHash, tokenFingerprint, deviceId, expiresAt);

        if (expiredTokensDeleted > 0 || deviceTokensDeleted > 0) {
            log.info("Device token cleanup completed: expiredDeleted={}, replacedForDevice={}, deviceId={}",
                    expiredTokensDeleted,
                    deviceTokensDeleted,
                    deviceId);
        }

        return new DeviceRegisterResponse(deviceToken, guestUserId);
    }

    private void validateDeviceCredentialInput(String deviceId, String deviceSecret) {
        validateCredentialField(
                "deviceId",
                deviceId,
                DEVICE_ID_MIN_LENGTH,
                DEVICE_ID_MAX_LENGTH,
                DEVICE_ID_PATTERN,
                "deviceId format is invalid");
        validateCredentialField(
                "deviceSecret",
                deviceSecret,
                DEVICE_SECRET_MIN_LENGTH,
                DEVICE_SECRET_MAX_LENGTH,
                DEVICE_SECRET_PATTERN,
                "deviceSecret format is invalid");
    }

    private void validateCredentialField(
            String field,
            String value,
            int minLength,
            int maxLength,
            Pattern pattern,
            String patternReason) {
        if (value == null || value.isBlank()) {
            throw invalidRegisterRequest(field, "must not be blank");
        }
        if (value.length() < minLength || value.length() > maxLength) {
            throw invalidRegisterRequest(field, "length must be between " + minLength + " and " + maxLength);
        }
        if (!pattern.matcher(value).matches()) {
            throw invalidRegisterRequest(field, patternReason);
        }
    }

    private BadRequestException invalidRegisterRequest(String field, String reason) {
        return new BadRequestException(
                "BAD_REQUEST",
                "Invalid device registration request",
                Map.of("field", field, "reason", reason));
    }
}
