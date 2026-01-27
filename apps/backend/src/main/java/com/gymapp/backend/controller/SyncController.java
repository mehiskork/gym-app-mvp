package com.gymapp.backend.controller;

import com.gymapp.backend.model.SyncRequest;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.service.SyncService;
import jakarta.validation.Valid;
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

    @PostMapping("/sync")
    public ResponseEntity<SyncResponse> sync(
            Authentication authentication,
            @Valid @RequestBody SyncRequest request) {
        String deviceId = authentication.getName();
        return ResponseEntity.ok(syncService.sync(deviceId, request.cursor(), request.ops()));
    }
}
