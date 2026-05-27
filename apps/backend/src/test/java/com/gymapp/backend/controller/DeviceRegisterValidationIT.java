package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DeviceRegisterValidationIT {
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
    private DataSource dataSource;

    @BeforeEach
    void migrateSchema() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
    }

    @Test
    void oversizedDeviceIdReturnsBadRequestAndCreatesNoDeviceRows() throws Exception {
        int initialDeviceCount = deviceCount();
        String deviceId = "d" + "a".repeat(80);

        mockMvc.perform(post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"deviceId":"%s","deviceSecret":"sec_valid_123456789"}
                        """.formatted(deviceId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));

        assertThat(deviceCount()).isEqualTo(initialDeviceCount);
    }

    @Test
    void invalidDeviceSecretReturnsBadRequestAndCreatesNoDeviceRows() throws Exception {
        int initialDeviceCount = deviceCount();

        mockMvc.perform(post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"deviceId":"dev_valid_123456","deviceSecret":"short"}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));

        assertThat(deviceCount()).isEqualTo(initialDeviceCount);
    }

    @Test
    void validMobileShapedRegistrationStillWorks() throws Exception {
        mockMvc.perform(post("/device/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"deviceId":"dev_12345678-1234-1234-1234-123456789012","deviceSecret":"sec_12345678-1234-1234-1234-123456789012"}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deviceToken").isNotEmpty())
                .andExpect(jsonPath("$.guestUserId").isNotEmpty());

        assertThat(deviceCount()).isEqualTo(1);
    }

    @Test
    void migrationCreatesDeviceTokenExpiresAtIndex() {
        Integer indexCount = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                          AND tablename = 'device_token'
                          AND indexname = 'idx_device_token_expires_at'
                        """,
                Integer.class);

        assertThat(indexCount).isEqualTo(1);
    }

    private Integer deviceCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM device", Integer.class);
    }
}
