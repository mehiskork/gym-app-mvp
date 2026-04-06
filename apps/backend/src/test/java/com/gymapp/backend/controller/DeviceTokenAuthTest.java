package com.gymapp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.service.SyncService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DeviceTokenAuthTest {

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
        }

        @Autowired
        private MockMvc mockMvc;

        @Autowired
        private JdbcTemplate jdbcTemplate;

        @Autowired
        private PasswordEncoder passwordEncoder;

        @Autowired
        private ObjectMapper objectMapper;

        @Autowired
        private DataSource dataSource;

        @MockitoBean
        private SyncService syncService;

        @BeforeEach
        void migrateSchema() {
                Flyway.configure()
                                .dataSource(dataSource)
                                .load()
                                .migrate();
        }

        @Test
        void expiredTokenReturnsUnauthorized() throws Exception {
                String deviceId = "device-expired";
                String guestUserId = "guest-expired";
                String rawToken = "expired-token";
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().minusSeconds(60));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken)
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_EXPIRED"));
        }

        @Test
        void invalidTokenReturnsUnauthorized() throws Exception {
                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer invalid-token")
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_INVALID_TOKEN"));
        }

        @Test
        void reregisteringDeviceInvalidatesPreviousTokenAndKeepsNewTokenValid() throws Exception {
                String deviceId = "device-reregister";
                String deviceSecret = "secret-reregister";

                RegistrationResult first = registerDevice(deviceId, deviceSecret);
                RegistrationResult second = registerDevice(deviceId, deviceSecret);

                when(syncService.sync(eq(deviceId),
                                eq(com.gymapp.backend.security.OwnerScope.guest(second.guestUserId())), any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + first.deviceToken())
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_INVALID_TOKEN"));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + second.deviceToken())
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isOk());

                Integer tokenCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM device_token WHERE device_id = ?",
                                Integer.class,
                                deviceId);
                Integer fingerprintedCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM device_token WHERE device_id = ? AND token_fingerprint IS NOT NULL",
                                Integer.class,
                                deviceId);

                org.assertj.core.api.Assertions.assertThat(tokenCount).isEqualTo(1);
                org.assertj.core.api.Assertions.assertThat(fingerprintedCount).isEqualTo(1);
                org.assertj.core.api.Assertions.assertThat(second.guestUserId()).isEqualTo(first.guestUserId());
        }

        @Test
        void registerCleansUpExpiredTokens() throws Exception {
                String expiredDeviceId = "device-expired-cleanup";
                insertDevice(expiredDeviceId, "guest-expired-cleanup");
                insertToken("expired-cleanup-token", expiredDeviceId, Instant.now().minusSeconds(120));

                Integer beforeCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM device_token WHERE device_id = ?",
                                Integer.class,
                                expiredDeviceId);
                org.assertj.core.api.Assertions.assertThat(beforeCount).isEqualTo(1);

                registerDevice("device-cleanup-trigger", "secret-cleanup");

                Integer afterCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM device_token WHERE device_id = ?",
                                Integer.class,
                                expiredDeviceId);
                org.assertj.core.api.Assertions.assertThat(afterCount).isZero();
        }

        @Test
        void legacyNullFingerprintTokenStillAuthenticatesWhileFallbackExists() throws Exception {
                String deviceId = "device-legacy";
                String guestUserId = "guest-legacy";
                String rawToken = "legacy-raw-token";

                insertDevice(deviceId, guestUserId);
                insertLegacyToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                when(syncService.sync(eq(deviceId), eq(com.gymapp.backend.security.OwnerScope.guest(guestUserId)),
                                any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken)
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isOk());
        }

        @Test
        void validTokenAllowsSync() throws Exception {
                String deviceId = "device-valid";
                String guestUserId = "guest-valid";
                String rawToken = "valid-token";
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                when(syncService.sync(eq(deviceId), eq(com.gymapp.backend.security.OwnerScope.guest(guestUserId)),
                                any(), any()))
                                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken)
                                .content("{\"cursor\":null,\"ops\":[]}"))
                                .andExpect(status().isOk());
        }

        private RegistrationResult registerDevice(String deviceId, String deviceSecret) throws Exception {
                String body = """
                                {"deviceId":"%s","deviceSecret":"%s"}
                                """.formatted(deviceId, deviceSecret);

                MvcResult result = mockMvc.perform(post("/device/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                                .andExpect(status().isOk())
                                .andReturn();

                JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
                return new RegistrationResult(response.path("deviceToken").asString(),
                                response.path("guestUserId").asString());
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
                String tokenFingerprint = com.gymapp.backend.repository.DeviceTokenRepository.TokenFingerprintUtils
                                .fingerprint(rawToken);
                OffsetDateTime expiresAtValue = OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
                jdbcTemplate.update(
                                "INSERT INTO device_token (token_hash, token_fingerprint, device_id, expires_at) VALUES (?, ?, ?, ?)",
                                tokenHash,
                                tokenFingerprint,
                                deviceId,
                                expiresAtValue);
        }

        private void insertLegacyToken(String rawToken, String deviceId, Instant expiresAt) {
                String tokenHash = passwordEncoder.encode(rawToken);
                OffsetDateTime expiresAtValue = OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
                jdbcTemplate.update(
                                "INSERT INTO device_token (token_hash, token_fingerprint, device_id, expires_at) VALUES (?, ?, ?, ?)",
                                tokenHash,
                                null,
                                deviceId,
                                expiresAtValue);
        }

        private record RegistrationResult(String deviceToken, String guestUserId) {
        }
}
