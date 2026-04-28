package com.gymapp.backend.controller;

import com.gymapp.backend.service.ReadinessService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class HealthController {
    private final ReadinessService readinessService;

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("ok");
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> ready() {
        ReadinessService.ReadinessResult readiness = readinessService.checkReadiness();
        if (readiness.ready()) {
            return ResponseEntity.ok(Map.of("status", "ready", "checks", readiness.checks()));
        }

        return ResponseEntity.status(503)
                .body(Map.of(
                        "status", "not_ready",
                        "checks", readiness.checks(),
                        "missingTables", readiness.missingTables()));
    }
}