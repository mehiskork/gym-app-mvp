package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.config.FirebaseJwtValidator;
import com.gymapp.backend.repository.AccountDeletionRepository;
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
    private AccountDeletionRepository accountDeletionRepository;

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
        assertThat(activeTombstoneCount(accountOwnerId)).isEqualTo(1L);

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());
        assertThat(activeTombstoneCount(accountOwnerId)).isEqualTo(1L);
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
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"))
                .andExpect(jsonPath("$.message").value("TrainFrame account was deleted"));

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId))
                .content("{\"cursor\":\"" + oldCursor + "\",\"ops\":[]}"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"));

        assertThat(totalSyncRows(linkedGuest)).isZero();
        assertThat(deviceCount(deviceId)).isZero();
    }

    @Test
    void staleAccountSyncReplayAfterDeletionIsBlockedAndWritesNoRows() throws Exception {
        String accountOwnerId = accountOwnerId("delete-recreate-" + UUID.randomUUID());
        seedSyncRows(accountOwnerId, null, "before-delete");

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        String entityId = "program-stale-" + UUID.randomUUID();
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
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"))
                .andExpect(jsonPath("$.details").value(nullValue()));

        assertThat(rowCount("entity_state", accountOwnerId)).isZero();
        assertThat(rowCount("change_log", accountOwnerId)).isZero();
        assertThat(rowCount("op_ledger", accountOwnerId)).isZero();
    }

    @Test
    void deletedFirebaseIdentityCanClaimAgainWithFreshActiveOwnerAndOldSessionCannotReplay() throws Exception {
        String uid = "recreate-same-google-" + UUID.randomUUID();
        String deletedOwnerId = accountOwnerId(uid);
        Instant oldAuthTime = Instant.now().minusSeconds(3600);
        String staleAccountToken = firebaseToken(uid, Instant.now().plusSeconds(3600), oldAuthTime);
        seedSyncRows(deletedOwnerId, null, "deleted-generation");

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + staleAccountToken))
                .andExpect(status().isNoContent());
        Instant deletedAt = activeTombstoneDeletedAt(deletedOwnerId);
        waitUntilAfter(deletedAt);

        String deviceId = "device-recreate-" + UUID.randomUUID();
        String guestUserId = "guest-recreate-" + UUID.randomUUID();
        String rawToken = "token-recreate-" + UUID.randomUUID();
        insertDevice(deviceId, guestUserId, "secret");
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

        MvcResult startResult = mockMvc.perform(post("/claim/start")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + rawToken))
                .andExpect(status().isOk())
                .andReturn();
        String claimCode = objectMapper.readTree(startResult.getResponse().getContentAsString()).path("code")
                .asString();

        String freshAccountToken = firebaseToken(uid, Instant.now().plusSeconds(3600), Instant.now());
        MvcResult confirmResult = mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + freshAccountToken)
                .header("X-Device-Authorization", "Bearer " + rawToken)
                .content("{\"code\":\"" + claimCode + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLAIMED"))
                .andExpect(jsonPath("$.recreated").value(true))
                .andReturn();
        String recreatedOwnerId = objectMapper.readTree(confirmResult.getResponse().getContentAsString())
                .path("userId")
                .asString();

        assertThat(recreatedOwnerId).isNotEqualTo(deletedOwnerId);
        assertThat(totalSyncRows(deletedOwnerId)).isZero();
        assertThat(totalSyncRows(recreatedOwnerId)).isZero();
        assertThat(activeIdentityOwner(deletedOwnerId)).isEqualTo(recreatedOwnerId);

        mockMvc.perform(post("/claim/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + freshAccountToken)
                .header("X-Device-Authorization", "Bearer " + rawToken)
                .content("{\"code\":\"" + claimCode + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(recreatedOwnerId))
                .andExpect(jsonPath("$.recreated").value(true));

        String staleEntityId = "program-stale-device-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + staleAccountToken)
                .content(syncUpsertBody("op-stale-device-" + UUID.randomUUID(), staleEntityId, "Stale Program")))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"));

        assertThat(rowCount("entity_state", recreatedOwnerId)).isZero();
        assertThat(rowCount("entity_state", deletedOwnerId)).isZero();
        assertThat(rowCount("op_ledger", recreatedOwnerId)).isZero();

        String freshEntityId = "program-recreated-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + freshAccountToken)
                .content(syncUpsertBody("op-recreated-" + UUID.randomUUID(), freshEntityId, "Recreated Program")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acks[0].status").value("applied"));

        assertThat(rowCount("entity_state", recreatedOwnerId)).isEqualTo(1L);
        assertThat(rowCount("entity_state", deletedOwnerId)).isZero();

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + freshAccountToken))
                .andExpect(status().isNoContent());
        assertThat(activeTombstoneCount(recreatedOwnerId)).isEqualTo(1L);
        assertThat(totalSyncRows(recreatedOwnerId)).isZero();

        String afterDeleteEntityId = "program-after-redelete-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + freshAccountToken)
                .content(syncUpsertBody("op-after-redelete-" + UUID.randomUUID(), afterDeleteEntityId,
                        "After Redelete Program")))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"));
        assertThat(totalSyncRows(recreatedOwnerId)).isZero();
    }

    @Test
    void missingAuthTimeCannotUseRecreatedIdentity() throws Exception {
        String uid = "recreate-missing-auth-time-" + UUID.randomUUID();
        String deletedOwnerId = accountOwnerId(uid);

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseToken(uid, Instant.now().plusSeconds(3600),
                        Instant.now().minusSeconds(120))))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenWithoutAuthTime(uid,
                        Instant.now().plusSeconds(3600)))
                .content("{\"cursor\":\"0\",\"ops\":[]}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));

        assertThat(totalSyncRows(deletedOwnerId)).isZero();
    }

    @Test
    void getMeWithTombstonedAccountReturnsAccountDeleted() throws Exception {
        String accountOwnerId = accountOwnerId("delete-me-get-" + UUID.randomUUID());

        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("ACCOUNT_DELETED"))
                .andExpect(jsonPath("$.message").value("TrainFrame account was deleted"));
    }

    @Test
    void guestSyncRemainsUnaffectedWhenAnotherAccountIsTombstoned() throws Exception {
        String accountOwnerId = accountOwnerId("delete-account-guest-unaffected-" + UUID.randomUUID());
        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        String deviceId = "device-guest-unaffected-" + UUID.randomUUID();
        String guestUserId = "guest-unaffected-" + UUID.randomUUID();
        String rawToken = "token-guest-unaffected-" + UUID.randomUUID();
        insertDevice(deviceId, guestUserId, "secret");
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

        String entityId = "program-guest-unaffected-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + rawToken)
                .content("""
                        {
                          "cursor":"0",
                          "ops":[{
                            "opId":"op-guest-%s",
                            "entityType":"program",
                            "entityId":"%s",
                            "opType":"upsert",
                            "payload":{
                              "id":"%s",
                              "name":"Guest Program",
                              "updated_at":"2026-05-08T00:00:00Z"
                            }
                          }]
                        }
                        """.formatted(UUID.randomUUID(), entityId, entityId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acks[0].status").value("applied"));

        assertThat(rowCount("entity_state", guestUserId)).isEqualTo(1L);
    }

    @Test
    void deviceRegisterAndClaimStartRemainUnaffectedByAccountTombstone() throws Exception {
        String accountOwnerId = accountOwnerId("delete-account-public-unaffected-" + UUID.randomUUID());
        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());

        String deviceId = "device-public-unaffected-" + UUID.randomUUID();
        String deviceSecret = "secret-public-unaffected";
        MvcResult registerResult = mockMvc.perform(post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"deviceId":"%s","deviceSecret":"%s"}
                        """.formatted(deviceId, deviceSecret)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deviceToken").isString())
                .andReturn();
        String deviceToken = objectMapper.readTree(registerResult.getResponse().getContentAsString())
                .path("deviceToken")
                .asString();

        mockMvc.perform(post("/claim/start")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + deviceToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").isString());
    }

    @Test
    void clearedTombstoneAllowsSameAccountMeAndSyncAgain() throws Exception {
        String accountOwnerId = accountOwnerId("delete-cleared-" + UUID.randomUUID());
        mockMvc.perform(delete("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isNoContent());
        clearTombstone(accountOwnerId);

        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.externalAccountId").value(accountOwnerId));

        String entityId = "program-cleared-" + UUID.randomUUID();
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + firebaseTokenForOwner(accountOwnerId))
                .content("""
                        {
                          "cursor":"0",
                          "ops":[{
                            "opId":"op-cleared-%s",
                            "entityType":"program",
                            "entityId":"%s",
                            "opType":"upsert",
                            "payload":{
                              "id":"%s",
                              "name":"Cleared Program",
                              "updated_at":"2026-05-08T00:00:00Z"
                            }
                          }]
                        }
                        """.formatted(UUID.randomUUID(), entityId, entityId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acks[0].status").value("applied"));

        assertThat(rowCount("entity_state", accountOwnerId)).isEqualTo(1L);
    }

    @Test
    void repositoryIgnoresClearedTombstoneAndMarkReactivatesIt() {
        String accountOwnerId = accountOwnerId("repo-reactivate-" + UUID.randomUUID());

        accountDeletionRepository.markAccountDeleted(accountOwnerId);
        assertThat(accountDeletionRepository.isAccountDeleted(accountOwnerId)).isTrue();

        clearTombstone(accountOwnerId);
        assertThat(accountDeletionRepository.isAccountDeleted(accountOwnerId)).isFalse();

        accountDeletionRepository.markAccountDeleted(accountOwnerId);
        assertThat(accountDeletionRepository.isAccountDeleted(accountOwnerId)).isTrue();
        assertThat(activeTombstoneCount(accountOwnerId)).isEqualTo(1L);
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

    private long activeTombstoneCount(String accountOwnerId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM account_deletion_tombstone
                        WHERE account_owner_id = ? AND cleared_at IS NULL
                        """,
                Long.class,
                accountOwnerId);
    }

    private Instant activeTombstoneDeletedAt(String accountOwnerId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT deleted_at
                        FROM account_deletion_tombstone
                        WHERE account_owner_id = ? AND cleared_at IS NULL
                        """,
                (rs, rowNum) -> rs.getTimestamp("deleted_at").toInstant(),
                accountOwnerId);
    }

    private String activeIdentityOwner(String firebaseSubjectId) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT active_account_owner_id
                        FROM account_identity
                        WHERE firebase_subject_id = ?
                        """,
                String.class,
                firebaseSubjectId);
    }

    private String syncUpsertBody(String opId, String entityId, String name) {
        return """
                {
                  "cursor":"0",
                  "ops":[{
                    "opId":"%s",
                    "entityType":"program",
                    "entityId":"%s",
                    "opType":"upsert",
                    "payload":{
                      "id":"%s",
                      "name":"%s",
                      "updated_at":"2026-05-08T00:00:00Z"
                    }
                  }]
                }
                """.formatted(opId, entityId, entityId, name);
    }

    private void waitUntilAfter(Instant instant) throws InterruptedException {
        long sleepMillis = instant.plusMillis(250).toEpochMilli() - Instant.now().toEpochMilli();
        if (sleepMillis > 0) {
            Thread.sleep(sleepMillis);
        }
    }

    private void clearTombstone(String accountOwnerId) {
        jdbcTemplate.update(
                """
                        UPDATE account_deletion_tombstone
                        SET cleared_at = now(),
                            cleared_by = 'test-support',
                            clear_reason = 'test clear'
                        WHERE account_owner_id = ?
                        """,
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
        return TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid, expiresAt,
                Instant.now().minusSeconds(60), true);
    }

    private String firebaseToken(String uid, Instant expiresAt, Instant authTime) {
        return TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid, expiresAt, authTime, true);
    }

    private String firebaseTokenWithoutAuthTime(String uid, Instant expiresAt) {
        return TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid, expiresAt,
                Instant.now().minusSeconds(60), false);
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

        String token(String issuer, String audience, String subject, Instant expiresAt, Instant authTime,
                boolean includeAuthTime) {
            try {
                JWTClaimsSet.Builder claimsBuilder = new JWTClaimsSet.Builder()
                        .issuer(issuer)
                        .audience(audience)
                        .subject(subject)
                        .issueTime(Date.from(Instant.now()))
                        .expirationTime(Date.from(expiresAt));
                if (includeAuthTime) {
                    claimsBuilder.claim("auth_time", authTime.getEpochSecond());
                }
                JWTClaimsSet claims = claimsBuilder.build();
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
