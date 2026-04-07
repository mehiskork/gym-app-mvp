package com.gymapp.backend.controller;

import com.gymapp.backend.config.DevicePrincipal;
import com.gymapp.backend.config.AccountPrincipal;
import com.gymapp.backend.config.SyncGuardrailsProperties;
import com.gymapp.backend.model.SyncRequest;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.security.PrincipalOwnerResolver;
import com.gymapp.backend.service.SyncService;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@Slf4j
public class SyncController {
        private final SyncService syncService;
        private final SyncGuardrailsProperties syncGuardrailsProperties;
        private final PrincipalOwnerResolver principalOwnerResolver;

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

                Object principal = authentication.getPrincipal();
                OwnerScope ownerScope = principalOwnerResolver.resolve(principal);
                String deviceId = principal instanceof DevicePrincipal devicePrincipal
                                ? devicePrincipal.getDeviceId()
                                : null;
                String authMode = resolveAuthMode(principal);
                String ownerScopeType = ownerScope.getType() == null || ownerScope.getType().isBlank()
                                ? "unknown"
                                : ownerScope.getType();
                log.info("sync request accepted authMode={} ownerScopeType={} opCount={}",
                                authMode,
                                ownerScopeType,
                                request.ops().size());

                SyncResponse response = "device_token".equals(authMode)
                                ? syncService.sync(
                                                deviceId,
                                                ownerScope.getOwnerId(),
                                                request.cursor(),
                                                request.ops())
                                : syncService.sync(
                                                deviceId,
                                                ownerScope,
                                                request.cursor(),
                                                request.ops());
                log.info("sync request completed authMode={} ownerScopeType={} opCount={} ackCount={} deltaCount={} hasMore={}",
                                authMode,
                                ownerScopeType,
                                request.ops().size(),
                                response != null && response.getAcks() != null ? response.getAcks().size() : 0,
                                response != null && response.getDeltas() != null ? response.getDeltas().size() : 0,
                                response != null ? response.getHasMore() : "unknown");
                return ResponseEntity.ok(response);
        }

        private String resolveAuthMode(Object principal) {
                if (principal instanceof DevicePrincipal) {
                        return "device_token";
                }
                if (principal instanceof AccountPrincipal) {
                        return "account_jwt";
                }
                return "unknown";
        }
}
