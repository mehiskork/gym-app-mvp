package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.gymapp.backend.service.ReadinessService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class HealthControllerTest {

    @Test
    void readyFailureResponseDoesNotExposeMissingTableNames() {
        ReadinessService readinessService = mock(ReadinessService.class);
        HealthController controller = new HealthController(readinessService);

        when(readinessService.checkReadiness()).thenReturn(new ReadinessService.ReadinessResult(
                false,
                Map.of("database", true, "flyway", false, "requiredTables", false),
                List.of("change_log", "device_token")));

        ResponseEntity<Map<String, Object>> response = controller.ready();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody())
                .containsEntry("status", "not_ready")
                .containsKey("checks")
                .doesNotContainKey("missingTables");
        assertThat(response.getBody().toString())
                .doesNotContain("change_log")
                .doesNotContain("device_token");
    }
}
