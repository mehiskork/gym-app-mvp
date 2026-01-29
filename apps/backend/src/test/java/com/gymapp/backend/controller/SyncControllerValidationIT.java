package com.gymapp.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SyncControllerValidationIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private DataSource dataSource;

    @BeforeEach
    void migrateSchema() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
    }

    @Test
    void deleteWithoutDeletedAtReturnsValidationError() throws Exception {
        String token = seedDeviceAndToken("device-delete-missing");
        String payload = """
                {"cursor":null,"ops":[{"opId":"op-1","entityType":"program","entityId":"program-1","opType":"delete","payload":{}}]}
                """;

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details.opId").value("op-1"));
    }

    @Test
    void deleteWithInvalidDeletedAtReturnsValidationError() throws Exception {
        String token = seedDeviceAndToken("device-delete-invalid");
        String payload = """
                {"cursor":null,"ops":[{"opId":"op-2","entityType":"program","entityId":"program-2","opType":"delete","payload":{"deleted_at":"not-a-timestamp"}}]}
                """;

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details.opId").value("op-2"));
    }

    @Test
    void unsupportedEntityTypeReturnsValidationError() throws Exception {
        String token = seedDeviceAndToken("device-entity-unsupported");
        String payload = """
                {"cursor":null,"ops":[{"opId":"op-3","entityType":"unknown_type","entityId":"entity-3","opType":"upsert","payload":{}}]}
                """;

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details.opId").value("op-3"));
    }

    private String seedDeviceAndToken(String deviceId) {
        String guestUserId = "guest-" + deviceId;
        String rawToken = "token-" + deviceId;
        insertDevice(deviceId, guestUserId);
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
        return rawToken;
    }

    private void insertDevice(String deviceId, String guestUserId) {
        String secretHash = passwordEncoder.encode("secret");
        jdbcTemplate.update(
                "INSERT INTO device (device_id, secret_hash, guest_user_id) VALUES (?, ?, ?)",
                deviceId,
                secretHash,
                guestUserId);
    }

    private void insertToken(String rawToken, String deviceId, Instant expiresAt) {
        String tokenHash = passwordEncoder.encode(rawToken);
        OffsetDateTime expiresAtValue = OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
        jdbcTemplate.update(
                "INSERT INTO device_token (token_hash, device_id, expires_at) VALUES (?, ?, ?)",
                tokenHash,
                deviceId,
                expiresAtValue);
    }
}
