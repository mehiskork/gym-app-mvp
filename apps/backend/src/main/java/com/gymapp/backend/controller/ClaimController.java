package com.gymapp.backend.controller;

import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.model.ClaimConfirmRequest;
import com.gymapp.backend.model.ClaimConfirmResponse;
import com.gymapp.backend.model.ClaimStartResponse;
import com.gymapp.backend.service.ClaimService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ClaimController {
    private final ClaimService claimService;
    private final ClaimDeviceCredentialResolver claimDeviceCredentialResolver;

    @PostMapping("/claim/start")
    public ResponseEntity<ClaimStartResponse> startClaim(Authentication authentication) {
        DevicePrincipal principal = (DevicePrincipal) authentication.getPrincipal();
        return ResponseEntity.ok(claimService.startClaim(
                principal.getDeviceId(),
                principal.getGuestUserId()));
    }

    @PostMapping("/claim/confirm")
    public ResponseEntity<ClaimConfirmResponse> confirmClaim(
            Authentication authentication,
            @org.springframework.web.bind.annotation.RequestHeader(
                    value = ClaimDeviceCredentialResolver.DEVICE_AUTHORIZATION_HEADER,
                    required = false) String deviceAuthorization,
            @Valid @RequestBody ClaimConfirmRequest request) {
        Object principal = authentication.getPrincipal();
        if (!(principal instanceof AccountPrincipal accountPrincipal)) {
            throw new UnauthorizedException("Account authentication required");
        }
        DevicePrincipal devicePrincipal = claimDeviceCredentialResolver.resolve(deviceAuthorization);
        return ResponseEntity.ok(claimService.confirmClaim(
                request.code(),
                accountPrincipal.getExternalAccountId(),
                devicePrincipal.getGuestUserId(),
                devicePrincipal.getDeviceId()));
    }
}
