package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class SyncAccountTransportIntegrationTest {

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
    private DataSource dataSource;

    @BeforeEach
    void migrateSchema() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
    }

    @Test
    void accountAuthenticatedSyncStoresNullDeviceTransportAndPrincipalOwner() throws Exception {
        String accountOwnerId = "https://issuer.example.test|acct-900";
        String body = """
                {
                  "cursor":"0",
                  "ops":[
                    {
                      "opId":"op-account-900",
                      "entityType":"program",
                      "entityId":"program-account-900",
                      "opType":"upsert",
                      "payload":{
                        "id":"program-account-900",
                        "name":"Account Program",
                        "updated_at":"2026-04-06T00:00:00Z",
                        "userId":"attacker-user"
                      }
                    }
                  ]
                }
                """;

        mockMvc.perform(post("/sync")
                .with(jwt().jwt(jwt -> jwt
                        .issuer("https://issuer.example.test")
                        .subject("acct-900")))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
                .andExpect(status().isOk());

        String storedOwner = jdbcTemplate.queryForObject(
                "SELECT guest_user_id FROM op_ledger WHERE op_id = ?",
                String.class,
                "op-account-900");
        String storedDeviceId = jdbcTemplate.queryForObject(
                "SELECT device_id FROM op_ledger WHERE op_id = ?",
                String.class,
                "op-account-900");
        String entityOwner = jdbcTemplate.queryForObject(
                "SELECT guest_user_id FROM entity_state WHERE entity_type = ? AND entity_id = ?",
                String.class,
                "program",
                "program-account-900");

        assertThat(storedOwner).isEqualTo(accountOwnerId);
        assertThat(storedDeviceId).isNull();
        assertThat(entityOwner).isEqualTo(accountOwnerId);
    }

    @Test
    void guestDeviceSyncStillWritesDeviceTransportContext() throws Exception {
        String deviceId = "device-seam-1";
        String guestUserId = "guest-seam-1";
        String rawToken = "token-seam-1";
        insertDevice(deviceId, guestUserId);
        insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));

        String body = """
                {
                  "cursor":"0",
                  "ops":[
                    {
                      "opId":"op-guest-1",
                      "entityType":"program",
                      "entityId":"program-guest-1",
                      "opType":"upsert",
                      "payload":{
                        "id":"program-guest-1",
                        "name":"Guest Program",
                        "updated_at":"2026-04-06T00:00:00Z"
                      }
                    }
                  ]
                }
                """;

        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + rawToken)
                .content(body))
                .andExpect(status().isOk());

        String storedDeviceId = jdbcTemplate.queryForObject(
                "SELECT device_id FROM op_ledger WHERE op_id = ?",
                String.class,
                "op-guest-1");
        String storedOwner = jdbcTemplate.queryForObject(
                "SELECT guest_user_id FROM op_ledger WHERE op_id = ?",
                String.class,
                "op-guest-1");

        assertThat(storedDeviceId).isEqualTo(deviceId);
        assertThat(storedOwner).isEqualTo(guestUserId);
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
}
