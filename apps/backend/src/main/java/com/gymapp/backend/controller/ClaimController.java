package com.gymapp.backend.controller;

import com.gymapp.backend.config.ClaimConfirmDevHeaderGuard;
import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.model.ClaimConfirmRequest;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.model.ClaimStartResponse;
import com.gymapp.backend.service.ClaimService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ClaimController {
    private static final String DEV_HEADER = "X-User-Id";

    private final ClaimService claimService;
    private final ClaimConfirmDevHeaderGuard claimConfirmDevHeaderGuard;

    @PostMapping("/claim/start")
    public ResponseEntity<ClaimStartResponse> startClaim(Authentication authentication) {
        DevicePrincipal principal = (DevicePrincipal) authentication.getPrincipal();
        return ResponseEntity.ok(claimService.startClaim(
                principal.getDeviceId(),
                principal.getGuestUserId()));
    }

    @PostMapping("/claim/confirm")
    public ResponseEntity<ClaimConfirmResponse> confirmClaim(
            @RequestHeader(value = DEV_HEADER, required = false) String userHeader,
            @Valid @RequestBody ClaimConfirmRequest request) {
        if (!claimConfirmDevHeaderGuard.isDevHeaderAllowed()) {
            throw new NotImplementedException("AUTH_NOT_CONFIGURED", "User header auth is disabled");
        }
        if (userHeader == null || userHeader.isBlank()) {
            throw new IllegalArgumentException("Missing X-User-Id header");
        }
        String userId = parseUserId(userHeader);
        return ResponseEntity.ok(claimService.confirmClaim(request.code(), userId));
    }

    private String parseUserId(String userHeader) {
        return UUID.fromString(userHeader.trim()).toString();
    }
}