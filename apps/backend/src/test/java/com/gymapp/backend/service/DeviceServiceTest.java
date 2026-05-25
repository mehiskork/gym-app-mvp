package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;

import com.gymapp.backend.controller.BadRequestException;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.DeviceTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class DeviceServiceTest {
    @Mock
    private DeviceRepository deviceRepository;

    @Mock
    private DeviceTokenRepository deviceTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private DeviceService deviceService;

    @Test
    void invalidInputIsRejectedBeforeLookupOrHashing() {
        assertThatThrownBy(() -> deviceService.registerDevice("bad", "short"))
                .isInstanceOf(BadRequestException.class);

        verifyNoInteractions(deviceRepository, deviceTokenRepository, passwordEncoder);
    }
}
