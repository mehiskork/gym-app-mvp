package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.config.FirebaseJwtValidator;
import com.gymapp.backend.security.OwnerScope;
import com.gymapp.backend.service.SyncService;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class ClaimFlowIntegrationTest {
        private static final String FIREBASE_PROJECT_ID = "gym-app-mvp-1d7f0";
        private static final String FIREBASE_ISSUER = "https://securetoken.google.com/" + FIREBASE_PROJECT_ID;
        private static final TokenSigner TOKEN_SIGNER = TokenSigner.create();

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
                registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> FIREBASE_ISSUER);
                registry.add("app.auth.firebase.project-id", () -> FIREBASE_PROJECT_ID);
                registry.add("rateLimit.claimConfirm.capacity", () -> "1000");

        }

        @TestConfiguration
        static class FirebaseClaimTestConfig {
                @Bean
                @Primary
                JwtDecoder firebaseTestJwtDecoder(FirebaseJwtValidator validator) {
                        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(TOKEN_SIGNER.publicKey()).build();
                        decoder.setJwtValidator(validator.validator(FIREBASE_ISSUER));
                        return decoder;
                }
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
        private SyncService syncService;

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
        void confirmRejectsMissingAuthorizationHeader() throws Exception {
                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
        }

        @Test
        void confirmRejectsInvalidBearerToken() throws Exception {
                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer not.a.jwt")
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
        }

        @Test
        void confirmRejectsMissingDeviceAuthorizationHeader() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String rawCode = "8J4K2M7N";
                UUID claimId = UUID.randomUUID();
                Instant now = Instant.now();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, now.plusSeconds(3600));
                insertClaim(claimId, rawCode, guestUserId, deviceId, now, now.plusSeconds(600));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseToken("firebase-user-" + UUID.randomUUID()))
                                .content("{\"code\":\"" + rawCode + "\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_DEVICE_TOKEN_REQUIRED"));

                String status = jdbcTemplate.queryForObject(
                                "SELECT status FROM claim WHERE claim_id = ?",
                                String.class,
                                claimId);
                assertThat(status).isEqualTo("PENDING");
        }

        @Test
        void confirmRejectsMalformedDeviceAuthorizationHeader() throws Exception {
                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseToken("firebase-user-" + UUID.randomUUID()))
                                .header("X-Device-Authorization", "Token nope")
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_DEVICE_TOKEN_MALFORMED"));
        }

        @Test
        void confirmRejectsInvalidDeviceToken() throws Exception {
                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseToken("firebase-user-" + UUID.randomUUID()))
                                .header("X-Device-Authorization", "Bearer invalid-device-token")
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_INVALID_DEVICE_TOKEN"));
        }

        @Test
        void confirmRejectsExpiredDeviceToken() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().minusSeconds(60));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseToken("firebase-user-" + UUID.randomUUID()))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isUnauthorized())
                                .andExpect(jsonPath("$.code").value("AUTH_TOKEN_EXPIRED"));
        }

        @Test
        void confirmWithInvalidCodeReturnsBadRequest() throws Exception {
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"INVALID12\"}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("CLAIM_INVALID"));
        }

        @Test
        void confirmWithExpiredCodeReturnsExpired() throws Exception {
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                String guestUserId = UUID.randomUUID().toString();
                String deviceId = "device-" + UUID.randomUUID();
                String rawCode = "9X3K7H2M";
                String rawToken = "token-" + UUID.randomUUID();
                UUID claimId = UUID.randomUUID();
                Instant createdAt = Instant.now().minusSeconds(7200);
                Instant expiresAt = Instant.now().minusSeconds(60);

                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                insertClaim(claimId, rawCode, guestUserId, deviceId, createdAt, expiresAt);

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
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
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
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
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-User-Id", accountOwnerId("ignored-" + UUID.randomUUID()))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
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
        void confirmWithAnotherDeviceTokenReturnsClaimInvalid() throws Exception {
                String claimDeviceId = "device-" + UUID.randomUUID();
                String claimGuestUserId = UUID.randomUUID().toString();
                String claimDeviceToken = "token-" + UUID.randomUUID();
                String otherDeviceId = "device-" + UUID.randomUUID();
                String otherGuestUserId = UUID.randomUUID().toString();
                String otherDeviceToken = "token-" + UUID.randomUUID();
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                insertDevice(claimDeviceId, claimGuestUserId);
                insertToken(claimDeviceToken, claimDeviceId, Instant.now().plusSeconds(3600));
                insertDevice(otherDeviceId, otherGuestUserId);
                insertToken(otherDeviceToken, otherDeviceId, Instant.now().plusSeconds(3600));

                String code = objectMapper.readTree(mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + claimDeviceToken))
                                .andExpect(status().isOk())
                                .andReturn()
                                .getResponse()
                                .getContentAsString()).get("code").asString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + otherDeviceToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("CLAIM_INVALID"));

                Long linkCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM identity_link WHERE guest_user_id = ?",
                                Long.class,
                                claimGuestUserId);
                assertThat(linkCount).isZero();
        }

        @Test
        void confirmWithCodeForAnotherGuestCannotClaim() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String otherDeviceId = "device-" + UUID.randomUUID();
                String otherGuestUserId = UUID.randomUUID().toString();
                String rawCode = "7J3K9M2N";
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                Instant now = Instant.now();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, now.plusSeconds(3600));
                insertClaim(UUID.randomUUID(), rawCode, otherGuestUserId, otherDeviceId, now, now.plusSeconds(600));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + rawCode + "\"}"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("CLAIM_INVALID"));

                Long linkCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM identity_link WHERE guest_user_id IN (?, ?)",
                                Long.class,
                                guestUserId,
                                otherGuestUserId);
                assertThat(linkCount).isZero();
        }

        @Test
        void confirmIsIdempotent() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
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
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.userId").value(userId));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.userId").value(userId));

                Long auditAttempts = jdbcTemplate.queryForObject(
                                "SELECT attempt_count FROM guest_account_migration_audit WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
                Long completedCount = jdbcTemplate.queryForObject(
                                """
                                                SELECT COUNT(*) FROM guest_account_migration_audit
                                                WHERE guest_user_id = ? AND completed_at IS NOT NULL
                                                """,
                                Long.class,
                                guestUserId);
                assertThat(auditAttempts).isEqualTo(2L);
                assertThat(completedCount).isEqualTo(1L);
        }

        @Test
        void confirmMigratesGuestOwnedSyncRowsIntoAccountOwnership() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                seedGuestSyncData(guestUserId, deviceId);

                MvcResult startResult = mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken))
                                .andExpect(status().isOk())
                                .andReturn();

                String code = objectMapper.readTree(startResult.getResponse().getContentAsString())
                                .get("code")
                                .asString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.guestUserId").value(guestUserId))
                                .andExpect(jsonPath("$.userId").value(userId))
                                .andExpect(jsonPath("$.status").value("CLAIMED"));

                Long guestEntityRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM entity_state WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
                Long accountEntityRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM entity_state WHERE guest_user_id = ?",
                                Long.class,
                                userId);
                Long accountChangeRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM change_log WHERE guest_user_id = ?",
                                Long.class,
                                userId);
                Long accountLedgerRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM op_ledger WHERE guest_user_id = ?",
                                Long.class,
                                userId);

                assertThat(guestEntityRows).isZero();
                assertThat(accountEntityRows).isEqualTo(1L);
                assertThat(accountChangeRows).isEqualTo(1L);
                assertThat(accountLedgerRows).isEqualTo(1L);
                assertThat(syncService.sync(null, OwnerScope.account(userId), "0", java.util.List.of()).getDeltas())
                                .hasSize(1);

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .content("{\"cursor\":\"0\",\"ops\":[]}"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.deltas").isArray());

        }

        @Test
        void confirmMigrationUsesLastReceivedAtWinnerForOverlappingEntityState() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = accountOwnerId("firebase-user-" + UUID.randomUUID());
                String entityId = "program-shared-" + UUID.randomUUID();
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

                insertEntityState(userId, entityId,
                                "{\"id\":\"program-account\",\"updated_at\":\"2026-04-01T00:00:00Z\"}",
                                Instant.parse("2026-04-01T00:00:00Z"));
                insertEntityState(guestUserId, entityId,
                                "{\"id\":\"program-guest\",\"updated_at\":\"2026-04-07T00:00:00Z\"}",
                                Instant.parse("2026-04-07T00:00:00Z"));

                String code = objectMapper.readTree(mockMvc.perform(post("/claim/start")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + rawToken))
                                .andExpect(status().isOk())
                                .andReturn()
                                .getResponse()
                                .getContentAsString()).get("code").asString();

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isOk());

                String payloadJson = jdbcTemplate.queryForObject(
                                """
                                                SELECT row_json::text
                                                FROM entity_state
                                                WHERE guest_user_id = ? AND entity_type = 'program' AND entity_id = ?
                                                """,
                                String.class,
                                userId,
                                entityId);
                Long conflictsResolved = jdbcTemplate.queryForObject(
                                """
                                                SELECT entity_conflicts_resolved
                                                FROM guest_account_migration_audit
                                                WHERE guest_user_id = ?
                                                """,
                                Long.class,
                                guestUserId);
                assertThat(payloadJson).contains("program-guest");
                assertThat(conflictsResolved).isEqualTo(1L);
        }

        @Test
        void confirmForTombstonedAccountReturnsGoneAndPreservesGuestData() throws Exception {
                String deviceId = "device-" + UUID.randomUUID();
                String guestUserId = UUID.randomUUID().toString();
                String rawToken = "token-" + UUID.randomUUID();
                String userId = accountOwnerId("firebase-user-deleted-" + UUID.randomUUID());
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                seedGuestSyncData(guestUserId, deviceId);
                markAccountDeleted(userId);

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
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userId))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
                                .content("{\"code\":\"" + code + "\"}"))
                                .andExpect(status().isGone())
                                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"))
                                .andExpect(jsonPath("$.message").value("TrainFrame account was deleted"));

                Long linkCount = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM identity_link WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
                Long accountEntityRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM entity_state WHERE guest_user_id = ?",
                                Long.class,
                                userId);
                Long guestEntityRows = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM entity_state WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
                String claimStatus = jdbcTemplate.queryForObject(
                                "SELECT status FROM claim WHERE claim_id = ?",
                                String.class,
                                UUID.fromString(claimId));

                assertThat(linkCount).isZero();
                assertThat(accountEntityRows).isZero();
                assertThat(guestEntityRows).isEqualTo(1L);
                assertThat(claimStatus).isEqualTo("PENDING");
        }

        @Test
        void confirmConflictReturns409() throws Exception {
                String userA = accountOwnerId("firebase-user-a-" + UUID.randomUUID());
                String userB = accountOwnerId("firebase-user-b-" + UUID.randomUUID());
                String guestUserId = UUID.randomUUID().toString();
                String deviceId = "device-" + UUID.randomUUID();
                String rawToken = "token-" + UUID.randomUUID();
                String rawCode = "7H2M9X3K";
                UUID claimId = UUID.randomUUID();
                Instant now = Instant.now();

                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                insertClaim(claimId, rawCode, guestUserId, deviceId, now, now.plusSeconds(600));
                insertIdentityLink(guestUserId, userA, now.minusSeconds(60));

                mockMvc.perform(post("/claim/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + firebaseTokenForOwner(userB))
                                .header("X-Device-Authorization", "Bearer " + rawToken)
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

        private void seedGuestSyncData(String guestUserId, String deviceId) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                                                VALUES (?, ?, ?, ?)
                                                """,
                                "seed-op-" + UUID.randomUUID(),
                                deviceId,
                                guestUserId,
                                OffsetDateTime.now(ZoneOffset.UTC));
                String entityId = "program-" + UUID.randomUUID();
                jdbcTemplate.update(
                                """
                                                INSERT INTO entity_state (
                                                        guest_user_id,
                                                        entity_type,
                                                        entity_id,
                                                        row_json,
                                                        last_received_at
                                                )
                                                VALUES (?, 'program', ?, '{\"id\":\"seed-program\",\"updated_at\":\"2026-04-06T00:00:00Z\"}'::jsonb, ?)
                                                """,
                                guestUserId,
                                entityId,
                                OffsetDateTime.now(ZoneOffset.UTC));
                jdbcTemplate.update(
                                """
                                                INSERT INTO change_log (
                                                        guest_user_id,
                                                        entity_type,
                                                        entity_id,
                                                        op_type,
                                                        row_json
                                                )
                                                VALUES (?, 'program', ?, 'upsert', '{\"id\":\"seed-program\"}'::jsonb)
                                                """,
                                guestUserId,
                                entityId);
        }

        private void insertEntityState(String ownerId, String entityId, String rowJson, Instant lastReceivedAt) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO entity_state (
                                                        guest_user_id,
                                                        entity_type,
                                                        entity_id,
                                                        row_json,
                                                        last_received_at
                                                ) VALUES (?, 'program', ?, ?::jsonb, ?)
                                                """,
                                ownerId,
                                entityId,
                                rowJson,
                                OffsetDateTime.ofInstant(lastReceivedAt, ZoneOffset.UTC));
        }

        private void markAccountDeleted(String accountOwnerId) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO account_deletion_tombstone (
                                                        account_owner_id,
                                                        deleted_at,
                                                        deletion_reason
                                                )
                                                VALUES (?, now(), 'test')
                                                """,
                                accountOwnerId);
        }

        private String accountOwnerId(String uid) {
                return FIREBASE_ISSUER + "|" + uid;
        }

        private String firebaseTokenForOwner(String ownerId) {
                int delimiter = ownerId.lastIndexOf('|');
                if (delimiter < 0 || delimiter == ownerId.length() - 1) {
                        throw new IllegalArgumentException("Invalid account owner id for test token");
                }
                return firebaseToken(ownerId.substring(delimiter + 1));
        }

        private String firebaseToken(String uid) {
                return TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid, Instant.now().plusSeconds(3600));
        }

        private static final class TokenSigner {
                private final RSAKey rsaKey;

                private TokenSigner(RSAKey rsaKey) {
                        this.rsaKey = rsaKey;
                }

                static TokenSigner create() {
                        try {
                                KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
                                generator.initialize(2048);
                                KeyPair keyPair = generator.generateKeyPair();
                                RSAKey rsaKey = new RSAKey.Builder((RSAPublicKey) keyPair.getPublic())
                                                .privateKey((RSAPrivateKey) keyPair.getPrivate())
                                                .keyID("firebase-claim-test-key")
                                                .build();
                                return new TokenSigner(rsaKey);
                        } catch (Exception e) {
                                throw new IllegalStateException("Failed to create test token signer", e);
                        }
                }

                RSAPublicKey publicKey() {
                        try {
                                return rsaKey.toRSAPublicKey();
                        } catch (Exception e) {
                                throw new IllegalStateException("Failed to read test public key", e);
                        }
                }

                String token(String issuer, String audience, String subject, Instant expiresAt) {
                        try {
                                JWTClaimsSet claims = new JWTClaimsSet.Builder()
                                                .issuer(issuer)
                                                .audience(audience)
                                                .subject(subject)
                                                .issueTime(Date.from(Instant.now()))
                                                .expirationTime(Date.from(expiresAt))
                                                .claim("auth_time", Instant.now().minusSeconds(60).getEpochSecond())
                                                .build();
                                SignedJWT jwt = new SignedJWT(
                                                new JWSHeader.Builder(JWSAlgorithm.RS256)
                                                                .keyID(rsaKey.getKeyID())
                                                                .type(JOSEObjectType.JWT)
                                                                .build(),
                                                claims);
                                jwt.sign(new RSASSASigner(rsaKey));
                                return jwt.serialize();
                        } catch (Exception e) {
                                throw new IllegalStateException("Failed to sign test JWT", e);
                        }
                }
        }
}
