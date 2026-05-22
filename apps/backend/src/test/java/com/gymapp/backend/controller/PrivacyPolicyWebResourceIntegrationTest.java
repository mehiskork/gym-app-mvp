package com.gymapp.backend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Testcontainers
class PrivacyPolicyWebResourceIntegrationTest {
    private static final String PUBLIC_WEB_CSP = String.join("; ",
            "default-src 'none'",
            "img-src 'self'",
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
        registry.add("trainframe.support.email", () -> "privacy@trainframe.example");
    }

    @Autowired
    private MockMvc mockMvc;

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
    void privacyPolicyPageIsPublicAndContainsRequiredCopy() throws Exception {
        mockMvc.perform(get("/privacy"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(content().string(containsString("TrainFrame privacy policy")))
                .andExpect(content().string(containsString("Effective date")))
                .andExpect(content().string(containsString("privacy@trainframe.example")))
                .andExpect(content().string(containsString("Developer/contact point")))
                .andExpect(content().string(containsString("SQLite")))
                .andExpect(content().string(containsString("backend")))
                .andExpect(content().string(containsString("Google Sign-In")))
                .andExpect(content().string(containsString("Firebase Authentication")))
                .andExpect(content().string(containsString("does not use Firebase Firestore")))
                .andExpect(content().string(containsString("guest/device mode")))
                .andExpect(content().string(containsString("merge into whichever Google account")))
                .andExpect(content().string(containsString("workout data")))
                .andExpect(content().string(containsString("sync metadata")))
                .andExpect(content().string(containsString("support bundle")))
                .andExpect(content().string(containsString("user-initiated and sanitized")))
                .andExpect(content().string(containsString("local notifications")))
                .andExpect(content().string(containsString("Settings -&gt; Delete account")))
                .andExpect(content().string(containsString("/account-deletion")))
                .andExpect(content().string(containsString("/terms")))
                .andExpect(content().string(containsString("does <strong>not</strong> delete your Google account")))
                .andExpect(content().string(containsString("does not automatically delete data")))
                .andExpect(content().string(containsString("may keep limited deletion and security records")))
                .andExpect(content().string(containsString("old sessions cannot restore deleted data")))
                .andExpect(content().string(containsString("same Google account can create a fresh TrainFrame account later")))
                .andExpect(content().string(containsString("Manual deletion requests are processed within 30 days")))
                .andExpect(content().string(containsString("does not sell your data")))
                .andExpect(content().string(containsString("does not show ads")))
                .andExpect(content().string(containsString("does not use analytics")))
                .andExpect(content().string(containsString("does not use your data for advertising")))
                .andExpect(content().string(containsString("HTTPS encryption in transit")))
                .andExpect(content().string(containsString("not directed to children under 13")))
                .andExpect(content().string(containsString("Policy changes")))
                .andExpect(content().string(containsString("Do not send passwords")))
                .andExpect(content().string(containsString("JWTs")))
                .andExpect(content().string(containsString("Firebase tokens")))
                .andExpect(content().string(containsString("device tokens")))
                .andExpect(content().string(containsString("keystores")));
    }

    @Test
    void protectedRoutesRemainProtected() throws Exception {
        mockMvc.perform(get("/me"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/sync")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
