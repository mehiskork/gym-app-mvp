package com.gymapp.backend.service;

import com.gymapp.backend.controller.ForbiddenException;
import com.gymapp.backend.model.DeviceRegisterResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.DeviceTokenRepository;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DeviceService {
    private final DeviceRepository deviceRepository;
    private final DeviceTokenRepository deviceTokenRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public DeviceRegisterResponse registerDevice(String deviceId, String deviceSecret) {
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

        String deviceToken = UUID.randomUUID().toString();
        String tokenHash = passwordEncoder.encode(deviceToken);
        deviceTokenRepository.insertToken(tokenHash, deviceId);

        return new DeviceRegisterResponse(deviceToken, guestUserId);
    }
}