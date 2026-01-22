package com.gymapp.backend.controller;

import com.gymapp.backend.model.SyncRequest;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.service.SyncService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SyncController {
    private final SyncService syncService;

    public SyncController(SyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/sync")
    public ResponseEntity<SyncResponse> sync(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @Valid @RequestBody SyncRequest request) {
        String token = extractBearerToken(authorization);
        return ResponseEntity.ok(syncService.sync(token, request.cursor(), request.ops()));
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw new IllegalArgumentException("Missing Authorization header");
        }
        if (!authorization.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Authorization header must use Bearer token");
        }
        return authorization.substring("Bearer ".length()).trim();
    }
}