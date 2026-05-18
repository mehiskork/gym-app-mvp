package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class AccountDeletionWebResourceIntegrationTest {
    private static final String PUBLIC_WEB_CSP = String.join("; ",
            "default-src 'none'",
            "style-src 'self' 'unsafe-inline'",
            "form-action 'self'",
            "base-uri 'none'",
            "frame-ancestors 'none'");

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
        registry.add("trainframe.support.email", () -> "support@trainframe.example");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AccountDeletionWebController accountDeletionWebController;

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
    void accountDeletionPageIsPublicAndExplainsDeletionRequestPath() throws Exception {
        mockMvc.perform(get("/account-deletion"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(content().string(containsString("TrainFrame account deletion request")))
                .andExpect(content().string(containsString("Settings -&gt; Delete account")))
                .andExpect(content().string(containsString("no longer have the app installed")))
                .andExpect(content().string(containsString("does <strong>not</strong> delete your Google account")))
                .andExpect(content().string(containsString("Do not send passwords")))
                .andExpect(content().string(containsString("JWTs")))
                .andExpect(content().string(containsString("device tokens")))
                .andExpect(content().string(containsString("support@trainframe.example")))
                .andExpect(content().string(containsString("mailto:support%40trainframe.example")))
                .andExpect(content().string(containsString("TrainFrame+account+deletion+request")))
                .andExpect(content().string(containsString("copy and paste this address")));
    }

    @Test
    void missingRequiredFormFieldsReturnsSafeValidationPage() throws Exception {
        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("message", "please delete")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.6");
                    return request;
                }))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("Enter a valid email address")))
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("SELECT"))));
    }

    @Test
    void validMinimalDeletionRequestReturnsEmailInstructionsWithoutAuthentication() throws Exception {
        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", "user@example.test")
                .param("confirmDeletion", "true")
                .param("noAppAccess", "true")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.1");
                    return request;
                }))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(content().string(containsString("Email TrainFrame support to request deletion")))
                .andExpect(content().string(containsString("does not automatically delete account data")))
                .andExpect(content().string(containsString("mailto:support%40trainframe.example")))
                .andExpect(content().string(containsString("user@example.test")))
                .andExpect(content().string(containsString("does not delete your Google account")))
                .andExpect(content().string(containsString("Do not send passwords, tokens")))
                .andExpect(content().string(not(containsString("request was received"))));
    }

    @Test
    void accountDeletionPageEscapesConfiguredSupportEmailInTextAndAttributes() throws Exception {
        Object originalSupportEmail = ReflectionTestUtils.getField(accountDeletionWebController, "supportEmail");
        try {
            ReflectionTestUtils.setField(
                    accountDeletionWebController,
                    "supportEmail",
                    "support@example.invalid\" autofocus onfocus=\"alert(1)");

            mockMvc.perform(get("/account-deletion"))
                    .andExpect(status().isOk())
                    .andExpect(content().string(containsString("support@example.invalid")))
                    .andExpect(content().string(containsString("mailto:support%40example.invalid")))
                    .andExpect(content().string(not(containsString("autofocus"))))
                    .andExpect(content().string(not(containsString("onfocus"))))
                    .andExpect(content().string(not(containsString("alert(1)"))));
        } finally {
            ReflectionTestUtils.setField(accountDeletionWebController, "supportEmail", originalSupportEmail);
        }
    }

    @Test
    void deletionRequestRejectsHtmlAndAttributeBreakingEmailInputSafely() throws Exception {
        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", "attacker@example.test\"><script>alert(1)</script>")
                .param("confirmDeletion", "true")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.2");
                    return request;
                }))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("Enter a valid email address")))
                .andExpect(content().string(not(containsString("<script>"))))
                .andExpect(content().string(not(containsString("alert(1)"))))
                .andExpect(content().string(not(containsString("\"<"))));
    }

    @Test
    void deletionRequestRejectsLongMaliciousEmailWithoutRegexBacktracking() throws Exception {
        String longEmail = "a".repeat(10_000) + "@example.test";

        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", longEmail)
                .param("confirmDeletion", "true")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.3");
                    return request;
                }))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("Enter a valid email address")))
                .andExpect(content().string(not(containsString(longEmail))));
    }

    @Test
    void statelessPublicDeletionRequestStillDoesNotRequireCsrfToken() throws Exception {
        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", "csrf-free@example.test")
                .param("confirmDeletion", "true")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.4");
                    return request;
                }))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Email TrainFrame support to request deletion")));
    }

    @Test
    void publicDeletionRequestDoesNotDeleteAccountDataDirectly() throws Exception {
        String ownerId = "https://securetoken.google.com/gym-app-mvp-1d7f0|web-delete-" + UUID.randomUUID();
        seedSyncRows(ownerId);

        mockMvc.perform(post("/account-deletion/request")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", "user@example.test")
                .param("confirmDeletion", "true")
                .with(request -> {
                    request.setRemoteAddr("10.51.0.5");
                    return request;
                }))
                .andExpect(status().isOk());

        assertThat(rowCount("entity_state", ownerId)).isEqualTo(1L);
        assertThat(rowCount("change_log", ownerId)).isEqualTo(1L);
        assertThat(rowCount("op_ledger", ownerId)).isEqualTo(1L);
    }

    @Test
    void healthAndReadyRemainPublic() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP));
        mockMvc.perform(get("/ready"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP));
    }

    private void seedSyncRows(String ownerId) {
        String entityId = "program-web-delete-" + UUID.randomUUID();
        jdbcTemplate.update(
                """
                        INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                        VALUES (?, ?, ?, ?)
                        """,
                "op-web-delete-" + UUID.randomUUID(),
                null,
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
                "{\"id\":\"" + entityId + "\",\"name\":\"keep\",\"updated_at\":\"2026-05-08T00:00:00Z\"}",
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
                "{\"id\":\"" + entityId + "\",\"name\":\"keep\"}");
    }

    private long rowCount(String tableName, String ownerId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + tableName + " WHERE guest_user_id = ?",
                Long.class,
                ownerId);
    }
}
