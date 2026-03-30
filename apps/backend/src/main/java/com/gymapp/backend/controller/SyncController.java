package com.gymapp.backend.controller;

import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.config.SyncGuardrailsProperties;
import com.gymapp.backend.model.SyncRequest;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.service.SyncService;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class SyncController {
    private final SyncService syncService;
    private final SyncGuardrailsProperties syncGuardrailsProperties;

    @PostMapping("/sync")
    public ResponseEntity<SyncResponse> sync(
            Authentication authentication,
            @Valid @RequestBody SyncRequest request) {
        if (request.ops().size() > syncGuardrailsProperties.getMaxOpsPerRequest()) {
            throw new ValidationException(
                    "sync ops exceeds max allowed per request",
                    Map.of(
                            "field", "ops",
                            "maxAllowed", syncGuardrailsProperties.getMaxOpsPerRequest(),
                            "actual", request.ops().size()));
        }

        DevicePrincipal principal = (DevicePrincipal) authentication.getPrincipal();
        return ResponseEntity.ok(syncService.sync(
                principal.getDeviceId(),
                principal.getGuestUserId(),
                request.cursor(),
                request.ops()));
    }
}
