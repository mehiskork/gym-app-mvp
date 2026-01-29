package com.gymapp.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.service.SyncService;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class RateLimitIntegrationTest {

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
        registry.add("rateLimit.sync.capacity", () -> "2");
        registry.add("rateLimit.sync.refillPerSecond", () -> "0");
        registry.add("rateLimit.register.capacity", () -> "2");
        registry.add("rateLimit.register.refillPerSecond", () -> "0");
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
    void registerIsRateLimitedByRemoteAddress() throws Exception {
        String requestBody = "{\"deviceId\":\"rate-limit-device\",\"deviceSecret\":\"secret\"}";
        MockHttpServletRequestBuilder request = post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody)
                .with(req -> {
                    req.setRemoteAddr("10.10.10.10");
                    return req;
                });

        mockMvc.perform(request).andExpect(status().isOk());
        mockMvc.perform(request).andExpect(status().isOk());
        mockMvc.perform(request)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void syncIsRateLimitedByDeviceId() throws Exception {
        String deviceId = "rate-limit-device-sync";
        String token = seedDeviceAndToken(deviceId);
        when(syncService.sync(eq(deviceId), any(), any()))
                .thenReturn(new SyncResponse(List.of(), null, List.of(), false));

        MockHttpServletRequestBuilder request = post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content("{\"cursor\":null,\"ops\":[]}");

        mockMvc.perform(request).andExpect(status().isOk());
        mockMvc.perform(request).andExpect(status().isOk());
        mockMvc.perform(request)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
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