package com.gymapp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.config.FirebaseJwtValidator;
import com.gymapp.backend.repository.DeviceTokenRepository;
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
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FirebaseAuthIT {
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
    static class FirebaseAuthTestConfig {
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
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

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
    void meRejectsMissingAuthorizationHeader() throws Exception {
        mockMvc.perform(get("/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meRejectsInvalidBearerToken() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meAcceptsValidFirebaseIdToken() throws Exception {
        String uid = "firebase-user-123";

        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid,
                        Instant.now().plusSeconds(3600))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.principalType").value("account"))
                .andExpect(jsonPath("$.issuer").value(FIREBASE_ISSUER))
                .andExpect(jsonPath("$.subject").value(uid))
                .andExpect(jsonPath("$.externalAccountId").value(FIREBASE_ISSUER + "|" + uid));
    }

    @Test
    void meRejectsWrongFirebaseIssuer() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(
                        "https://securetoken.google.com/wrong-project",
                        FIREBASE_PROJECT_ID,
                        "firebase-user-wrong-issuer",
                        Instant.now().plusSeconds(3600))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meRejectsWrongFirebaseAudience() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(
                        FIREBASE_ISSUER,
                        "wrong-project",
                        "firebase-user-wrong-audience",
                        Instant.now().plusSeconds(3600))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meRejectsBlankFirebaseSubject() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(
                        FIREBASE_ISSUER,
                        FIREBASE_PROJECT_ID,
                        " ",
                        Instant.now().plusSeconds(3600))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meRejectsMissingFirebaseSubject() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.tokenWithoutSubject(
                        FIREBASE_ISSUER,
                        FIREBASE_PROJECT_ID,
                        Instant.now().plusSeconds(3600))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void meRejectsExpiredFirebaseToken() throws Exception {
        mockMvc.perform(get("/me")
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(
                        FIREBASE_ISSUER,
                        FIREBASE_PROJECT_ID,
                        "firebase-user-expired",
                        Instant.now().minusSeconds(3600))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_UNAUTHORIZED"));
    }

    @Test
    void syncAcceptsValidFirebaseAccountTokenAndUsesVerifiedOwner() throws Exception {
        String uid = "firebase-sync-user-123";
        when(syncService.sync(eq(null), eq(OwnerScope.account(FIREBASE_ISSUER + "|" + uid)), eq(null), any()))
                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + TOKEN_SIGNER.token(FIREBASE_ISSUER, FIREBASE_PROJECT_ID, uid,
                        Instant.now().plusSeconds(3600)))
                .content("{\"cursor\":null,\"ops\":[]}"))
                .andExpect(status().isOk());

        verify(syncService).sync(eq(null), eq(OwnerScope.account(FIREBASE_ISSUER + "|" + uid)), eq(null), any());
    }

    @Test
    void syncStillAcceptsValidDeviceToken() throws Exception {
        String deviceId = "firebase-test-device";
        String guestUserId = "firebase-test-guest";
        String rawToken = "firebase-test-device-token";
        insertDevice(deviceId, guestUserId);
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

        when(syncService.sync(eq(deviceId), eq(OwnerScope.guest(guestUserId)), eq(null), any()))
                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + rawToken)
                .content("{\"cursor\":null,\"ops\":[]}"))
                .andExpect(status().isOk());
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
        String tokenFingerprint = DeviceTokenRepository.TokenFingerprintUtils.fingerprint(rawToken);
        OffsetDateTime expiresAtValue = OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
        jdbcTemplate.update(
                "INSERT INTO device_token (token_hash, token_fingerprint, device_id, expires_at) VALUES (?, ?, ?, ?)",
                tokenHash,
                tokenFingerprint,
                deviceId,
                expiresAtValue);
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
                        .keyID("firebase-test-key")
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
            return token(issuer, audience, subject, expiresAt, true);
        }

        String tokenWithoutSubject(String issuer, String audience, Instant expiresAt) {
            return token(issuer, audience, null, expiresAt, false);
        }

        private String token(String issuer, String audience, String subject, Instant expiresAt, boolean includeSubject) {
            try {
                JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                        .issuer(issuer)
                        .audience(audience)
                        .issueTime(Date.from(Instant.now()))
                        .expirationTime(Date.from(expiresAt));
                if (includeSubject) {
                    claims.subject(subject);
                }
                SignedJWT jwt = new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256)
                                .keyID(rsaKey.getKeyID())
                                .type(JOSEObjectType.JWT)
                                .build(),
                        claims.build());
                jwt.sign(new RSASSASigner(rsaKey));
                return jwt.serialize();
            } catch (Exception e) {
                throw new IllegalStateException("Failed to sign test JWT", e);
            }
        }
    }
}
