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

        @SuppressWarnings("resource")
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
                registry.add("sync.maxOpsPerRequest", () -> "2");
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
        void deleteWithSqliteDeletedAtIsAccepted() throws Exception {
                String token = seedDeviceAndToken("device-delete-sqlite");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-4","entityType":"program","entityId":"program-4","opType":"delete","payload":{"deleted_at":"2026-02-13 12:34:56"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-4"));
        }

        @Test
        void upsertWithInvalidUpdatedAtReturnsValidationError() throws Exception {
                String token = seedDeviceAndToken("device-upsert-invalid-updated-at");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-5","entityType":"program","entityId":"program-5","opType":"upsert","payload":{"updated_at":"not-a-timestamp"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-5"))
                                .andExpect(jsonPath("$.details.field").value("updated_at"));
        }

        @Test
        void upsertWithSqliteUpdatedAtIsAccepted() throws Exception {
                String token = seedDeviceAndToken("device-upsert-sqlite-updated-at");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-6","entityType":"program","entityId":"program-6","opType":"upsert","payload":{"updated_at":"2026-02-13 12:34:56"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-6"));
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

        @Test
        void syncRejectsWhenOpsCountExceedsServerGuardrail() throws Exception {
                String token = seedDeviceAndToken("device-ops-max-limit");
                String payload = """
                                {"cursor":null,"ops":[
                                    {"opId":"op-a","entityType":"program","entityId":"program-a","opType":"upsert","payload":{}},
                                    {"opId":"op-b","entityType":"program","entityId":"program-b","opType":"upsert","payload":{}},
                                    {"opId":"op-c","entityType":"program","entityId":"program-c","opType":"upsert","payload":{}}
                                ]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.field").value("ops"))
                                .andExpect(jsonPath("$.details.maxAllowed").value(2))
                                .andExpect(jsonPath("$.details.actual").value(3));
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
