package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
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
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ClaimFlowIntegrationTest {

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
                registry.add("claim.devUserHeaderEnabled", () -> "true");
        }

        @Autowired
        private MockMvc mockMvc;

        @Autowired
        private ObjectMapper objectMapper;

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
        void startReturnsCodeAndPersistsHashedClaim() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

                MvcResult result = mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.code").isString())
                                .andExpect(jsonPath("$.expiresAt").isString())
                                .andReturn();

                JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
                String claimId = body.get("claimId").asString();
                String code = body.get("code").asString();

                Map<String, Object> claimRow = jdbcTemplate.queryForMap(
                                "SELECT status, secret_hash FROM claim WHERE claim_id = ?",
                                UUID.fromString(claimId));

                assertThat(code).hasSize(8);
                assertThat(claimRow.get("status")).isEqualTo("PENDING");
                assertThat(claimRow.get("secret_hash")).isNotEqualTo(code);
        }

        @Test
        void confirmWithInvalidCodeReturnsBadRequest() throws Exception {
                String userId = UUID.randomUUID().toString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userId)
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("CLAIM_INVALID"));
        }

        @Test
        void confirmWithExpiredCodeReturnsExpired() throws Exception {
                String userId = UUID.randomUUID().toString();
                String guestUserId = UUID.randomUUID().toString();
                String deviceId = "device-" + UUID.randomUUID();
                String rawCode = "9X3K7H2M";
                UUID claimId = UUID.randomUUID();
                Instant createdAt = Instant.now().minusSeconds(7200);
                Instant expiresAt = Instant.now().minusSeconds(60);

                insertClaim(claimId, rawCode, guestUserId, deviceId, createdAt, expiresAt);

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userId)
                                .content("{\"code\":\"" + rawCode + "\"}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("CLAIM_EXPIRED"));

                String status = jdbcTemplate.queryForObject(
                                "SELECT status FROM claim WHERE claim_id = ?",
                                String.class,
                                claimId);
                assertThat(status).isEqualTo("EXPIRED");
        }

        @Test
        void confirmSuccessCreatesIdentityLink() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = UUID.randomUUID().toString();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

                MvcResult startResult = mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken))
                                .andExpect(status().isOk())
                                .andReturn();

                JsonNode startBody = objectMapper.readTree(startResult.getResponse().getContentAsString());
                String claimId = startBody.get("claimId").asString();
                String code = startBody.get("code").asString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userId)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.guestUserId").value(guestUserId))
                                .andExpect(jsonPath("$.userId").value(userId))
                                .andExpect(jsonPath("$.status").value("CLAIMED"));

                String linkedUserId = jdbcTemplate.queryForObject(
                                "SELECT user_id FROM identity_link WHERE guest_user_id = ?",
                                String.class,
                                guestUserId);
                assertThat(linkedUserId).isEqualTo(userId);

                Map<String, Object> claimRow = jdbcTemplate.queryForMap(
                                "SELECT status, claimed_by_user_id FROM claim WHERE claim_id = ?",
                                UUID.fromString(claimId));
                assertThat(claimRow.get("status")).isEqualTo("CLAIMED");
                assertThat(claimRow.get("claimed_by_user_id")).isEqualTo(userId);
        }

        @Test
        void confirmIsIdempotent() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = UUID.randomUUID().toString();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

                MvcResult startResult = mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken))
                                .andExpect(status().isOk())
                                .andReturn();

                JsonNode startBody = objectMapper.readTree(startResult.getResponse().getContentAsString());
                String code = startBody.get("code").asString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userId)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.userId").value(userId));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userId)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.userId").value(userId));
        }

        @Test
        void confirmConflictReturns409() throws Exception {
                String userA = UUID.randomUUID().toString();
                String userB = UUID.randomUUID().toString();
                String guestUserId = UUID.randomUUID().toString();
                String deviceId = "device-" + UUID.randomUUID();
                String rawCode = "7H2M9X3K";
                UUID claimId = UUID.randomUUID();
                Instant now = Instant.now();

                insertClaim(claimId, rawCode, guestUserId, deviceId, now, now.plusSeconds(600));
                insertIdentityLink(guestUserId, userA, now.minusSeconds(60));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("X-User-Id", userB)
                                .content("{\"code\":\"" + rawCode + "\"}"))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.code").value("CLAIM_CONFLICT"));
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

        private void insertClaim(
                        UUID claimId,
                        String rawCode,
                        String guestUserId,
                        String deviceId,
                        Instant createdAt,
                        Instant expiresAt) {
                String hash = passwordEncoder.encode(rawCode);
                jdbcTemplate.update(
                                """
                                                INSERT INTO claim (
                                                    claim_id,
                                                    claim_type,
                                                    secret_hash,
                                                    guest_user_id,
                                                    device_id,
                                                    status,
                                                    created_at,
                                                    expires_at
                                                )
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                                """,
                                claimId,
                                "CODE",
                                hash,
                                guestUserId,
                                deviceId,
                                "PENDING",
                                OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC),
                                OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC));
        }

        private void insertIdentityLink(String guestUserId, String userId, Instant createdAt) {
                jdbcTemplate.update(
                                "INSERT INTO identity_link (guest_user_id, user_id, created_at) VALUES (?, ?, ?)",
                                guestUserId,
                                userId,
                                OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC));
        }
}