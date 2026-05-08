package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.config.FirebaseJwtValidator;
import com.gymapp.backend.repository.DeviceTokenRepository;
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
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class AccountDeletionIntegrationTest {
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
    }

    @TestConfiguration
    static class FirebaseAccountDeletionTestConfig {
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
    private DataSource dataSource;

    @BeforeEach
    void migrateSchema() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
    }

    @Test
    void deleteMeRequiresAccountAuthentication() throws Exception {
        mockMvc.perform(delete("/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseToken("delete-expired", Instant.now().minusSeconds(60))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));

        String deviceId = "device-delete-auth-" + UUID.randomUUID();
        String guestUserId = "guest-delete-auth-" + UUID.randomUUID();
        String rawToken = "token-delete-auth-" + UUID.randomUUID();
        insertDevice(deviceId, guestUserId, "secret");
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + rawToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void deleteMeHardDeletesAccountRowsAndIsIdempotent() throws Exception {
        String accountOwnerId = accountOwnerId("delete-account-" + UUID.randomUUID());
        seedSyncRows(accountOwnerId, "device-unused", "account");
        insertClaim("claim-account-" + UUID.randomUUID(), "guest-claim-account-" + UUID.randomUUID(),
                "device-claim-account-" + UUID.randomUUID(), accountOwnerId);

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        assertThat(rowCount("entity_state", accountOwnerId)).isZero();
        assertThat(rowCount("change_log", accountOwnerId)).isZero();
        assertThat(rowCount("op_ledger", accountOwnerId)).isZero();
        assertThat(claimCountForAccount(accountOwnerId)).isZero();

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteMeIgnoresBodyAndDoesNotDeleteOtherAccountOrGuestRows() throws Exception {
        String accountA = accountOwnerId("delete-account-a-" + UUID.randomUUID());
        String accountB = accountOwnerId("delete-account-b-" + UUID.randomUUID());
        String unrelatedGuest = "guest-unrelated-" + UUID.randomUUID();
        seedSyncRows(accountA, "device-a", "account-a");
        seedSyncRows(accountB, "device-b", "account-b");
        seedSyncRows(unrelatedGuest, "device-guest", "guest");

        mockMvc.perform(delete("/me")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountA))
                .content("""
                        {
                          "userId":"%s",
                          "accountId":"%s",
                          "guestUserId":"%s",
                          "owner":"%s"
                        }
                        """.formatted(accountB, accountB, unrelatedGuest, accountB)))
                .andExpect(status().isNoContent());

        assertThat(totalSyncRows(accountA)).isZero();
        assertThat(totalSyncRows(accountB)).isEqualTo(3L);
        assertThat(totalSyncRows(unrelatedGuest)).isEqualTo(3L);
    }

    @Test
    void deleteMeDeletesLinkedGuestMetadataDevicesAndIncompleteMigrationLeftovers() throws Exception {
        String accountOwnerId = accountOwnerId("delete-linked-" + UUID.randomUUID());
        String linkedGuest = "guest-linked-" + UUID.randomUUID();
        String deviceId = "device-linked-" + UUID.randomUUID();
        String rawToken = "token-linked-" + UUID.randomUUID();
        String deviceSecret = "secret-linked";
        insertDevice(deviceId, linkedGuest, deviceSecret);
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
        insertIdentityLink(linkedGuest, accountOwnerId);
        insertMigrationAudit(linkedGuest, accountOwnerId);
        insertClaim("claim-linked-" + UUID.randomUUID(), linkedGuest, deviceId, accountOwnerId);
        seedSyncRows(accountOwnerId, null, "account-linked");
        seedSyncRows(linkedGuest, deviceId, "linked-leftover");

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        assertThat(totalSyncRows(accountOwnerId)).isZero();
        assertThat(totalSyncRows(linkedGuest)).isZero();
        assertThat(identityLinkCount(accountOwnerId)).isZero();
        assertThat(migrationAuditCount(accountOwnerId)).isZero();
        assertThat(claimCountForAccount(accountOwnerId)).isZero();
        assertThat(deviceTokenCount(deviceId)).isZero();
        assertThat(deviceCount(deviceId)).isZero();

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + rawToken)
                .content("{\"cursor\":\"0\",\"ops\":[]}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_INVALID_TOKEN"));

        MvcResult registerResult = mockMvc.perform(post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"deviceId":"%s","deviceSecret":"%s"}
                        """.formatted(deviceId, deviceSecret)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode registerBody = objectMapper.readTree(registerResult.getResponse().getContentAsString());
        assertThat(registerBody.path("guestUserId").asString()).isNotEqualTo(linkedGuest);
    }

    @Test
    void deleteMeCoversNormalMigratedGuestDataAndSyncCannotReplayIt() throws Exception {
        String accountOwnerId = accountOwnerId("delete-migrated-" + UUID.randomUUID());
        String linkedGuest = "guest-migrated-" + UUID.randomUUID();
        String deviceId = "device-migrated-" + UUID.randomUUID();
        insertIdentityLink(linkedGuest, accountOwnerId);
        insertMigrationAudit(linkedGuest, accountOwnerId);
        seedSyncRows(accountOwnerId, null, "migrated-account");
        long oldCursor = 1L;

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId))
                .content("{\"cursor\":\"0\",\"ops\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltas").isEmpty());

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId))
                .content("{\"cursor\":\"" + oldCursor + "\",\"ops\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltas").isEmpty());

        assertThat(totalSyncRows(linkedGuest)).isZero();
        assertThat(deviceCount(deviceId)).isZero();
    }

    @Test
    void sameFirebaseSubjectCanCreateFreshDataAfterDeletion() throws Exception {
        String accountOwnerId = accountOwnerId("delete-recreate-" + UUID.randomUUID());
        seedSyncRows(accountOwnerId, null, "before-delete");

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        // There is no tombstone/account table in this PR; same-subject recreation is accepted.
        String entityId = "program-fresh-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId))
                .content("""
                        {
                          "cursor":"0",
                          "ops":[{
                            "opId":"op-fresh-%s",
                            "entityType":"program",
                            "entityId":"%s",
                            "opType":"upsert",
                            "payload":{
                              "id":"%s",
                              "name":"Fresh Program",
                              "updated_at":"2026-05-08T00:00:00Z"
                            }
                          }]
                        }
                        """.formatted(UUID.randomUUID(), entityId, entityId)))
                .andExpect(status().isOk());

        assertThat(rowCount("entity_state", accountOwnerId)).isEqualTo(1L);
        assertThat(rowCount("change_log", accountOwnerId)).isEqualTo(1L);
        assertThat(rowCount("op_ledger", accountOwnerId)).isEqualTo(1L);
    }

    @Test
    void unexpectedDeletionErrorUsesStructuredResponseWithoutSqlDetails() throws Exception {
        mockMvc.perform(delete("/me")
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                        .authentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                                com.gymapp.backend.config.AccountPrincipal.builder()
                                        .principalType("account")
                                        .externalAccountId("malformed-owner")
                                        .issuer("issuer")
                                        .subject("subject")
                                        .build(),
                                null,
                                java.util.List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority(
                                        "ROLE_ACCOUNT"))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(
                        "SELECT"))));
    }

    private void seedSyncRows(String ownerId, String deviceId, String suffix) {
        String entityId = "program-" + suffix + "-" + UUID.randomUUID();
        jdbcTemplate.update(
                """
                        INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                        VALUES (?, ?, ?, ?)
                        """,
                "op-" + suffix + "-" + UUID.randomUUID(),
                deviceId,
                ownerId,
                OffsetDateTime.now(ZoneOffset.UTC));
        jdbcTemplate.update(
                """
                        INSERT INTO entity_state (
                            guest_user_id,
                            entity_type,
                            entity_id,
                            row_json,
                            last_received_at
                        )
                        VALUES (?, 'program', ?, ?::jsonb, ?)
                        """,
                ownerId,
                entityId,
                "{\"id\":\"" + entityId + "\",\"name\":\"" + suffix
                        + "\",\"updated_at\":\"2026-05-08T00:00:00Z\"}",
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
                        VALUES (?, 'program', ?, 'upsert', ?::jsonb)
                        """,
                ownerId,
                entityId,
                "{\"id\":\"" + entityId + "\",\"name\":\"" + suffix + "\"}");
    }

    private void insertIdentityLink(String guestUserId, String accountOwnerId) {
        jdbcTemplate.update(
                "INSERT INTO identity_link (guest_user_id, user_id, created_at) VALUES (?, ?, ?)",
                guestUserId,
                accountOwnerId,
                OffsetDateTime.now(ZoneOffset.UTC));
    }

    private void insertMigrationAudit(String guestUserId, String accountOwnerId) {
        jdbcTemplate.update(
                """
                        INSERT INTO guest_account_migration_audit (
                            guest_user_id,
                            user_id,
                            first_attempted_at,
                            last_attempted_at,
                            attempt_count,
                            completed_at
                        )
                        VALUES (?, ?, ?, ?, 1, ?)
                        """,
                guestUserId,
                accountOwnerId,
                OffsetDateTime.now(ZoneOffset.UTC),
                OffsetDateTime.now(ZoneOffset.UTC),
                OffsetDateTime.now(ZoneOffset.UTC));
    }

    private void insertClaim(String claimId, String guestUserId, String deviceId, String accountOwnerId) {
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
                            expires_at,
                            claimed_at,
                            claimed_by_user_id
                        )
                        VALUES (?, 'CODE', ?, ?, ?, 'CLAIMED', ?, ?, ?, ?)
                        """,
                UUID.nameUUIDFromBytes(claimId.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                passwordEncoder.encode("ABCDEFGH"),
                guestUserId,
                deviceId,
                OffsetDateTime.now(ZoneOffset.UTC),
                OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
                OffsetDateTime.now(ZoneOffset.UTC),
                accountOwnerId);
    }

    private void insertDevice(String deviceId, String guestUserId, String deviceSecret) {
        jdbcTemplate.update(
                "INSERT INTO device (device_id, secret_hash, guest_user_id) VALUES (?, ?, ?)",
                deviceId,
                passwordEncoder.encode(deviceSecret),
                guestUserId);
    }

    private void insertToken(String rawToken, String deviceId, Instant expiresAt) {
        jdbcTemplate.update(
                "INSERT INTO device_token (token_hash, token_fingerprint, device_id, expires_at) VALUES (?, ?, ?, ?)",
                passwordEncoder.encode(rawToken),
                DeviceTokenRepository.TokenFingerprintUtils.fingerprint(rawToken),
                deviceId,
                OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC));
    }

    private long totalSyncRows(String ownerId) {
        return rowCount("entity_state", ownerId)
                + rowCount("change_log", ownerId)
                + rowCount("op_ledger", ownerId);
    }

    private long rowCount(String tableName, String ownerId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + tableName + " WHERE guest_user_id = ?",
                Long.class,
                ownerId);
    }

    private long identityLinkCount(String accountOwnerId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM identity_link WHERE user_id = ?",
                Long.class,
                accountOwnerId);
    }

    private long migrationAuditCount(String accountOwnerId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM guest_account_migration_audit WHERE user_id = ?",
                Long.class,
                accountOwnerId);
    }

    private long claimCountForAccount(String accountOwnerId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM claim WHERE claimed_by_user_id = ?",
                Long.class,
                accountOwnerId);
    }

    private long deviceTokenCount(String deviceId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device_token WHERE device_id = ?",
                Long.class,
                deviceId);
    }

    private long deviceCount(String deviceId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device WHERE device_id = ?",
                Long.class,
                deviceId);
    }

    private String accountOwnerId(String uid) {
        return FIREBASE_ISSUER + "|" + uid;
    }

    private String firebaseTokenForOwner(String ownerId) {
        int delimiter = ownerId.lastIndexOf('|');
        if (delimiter < 0 || delimiter == ownerId.length() - 1) {
            throw new IllegalArgumentException("Invalid account owner id for test token");
        }
        return firebaseToken(ownerId.substring(delimiter + 1), Instant.now().plusSeconds(3600));
    }

    private String firebaseToken(String uid, Instant expiresAt) {
        return TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid, expiresAt);
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
                        .keyID("firebase-account-deletion-test-key")
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
                throw new IllegalStateException("Failed to sign test token", e);
            }
        }
    }
}
