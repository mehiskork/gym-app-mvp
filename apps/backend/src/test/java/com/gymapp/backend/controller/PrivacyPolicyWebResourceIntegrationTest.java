package com.gymapp.backend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
                .andExpect(content().string(containsString("TrainFrame privacy policy")))
                .andExpect(content().string(containsString("Effective date")))
                .andExpect(content().string(containsString("privacy@trainframe.example")))
                .andExpect(content().string(containsString("SQLite")))
                .andExpect(content().string(containsString("backend")))
                .andExpect(content().string(containsString("Google Sign-In")))
                .andExpect(content().string(containsString("Firebase Authentication")))
                .andExpect(content().string(containsString("guest/device mode")))
                .andExpect(content().string(containsString("workout data")))
                .andExpect(content().string(containsString("sync metadata")))
                .andExpect(content().string(containsString("support bundle")))
                .andExpect(content().string(containsString("local notifications")))
                .andExpect(content().string(containsString("Settings -&gt; Delete account")))
                .andExpect(content().string(containsString("/account-deletion")))
                .andExpect(content().string(containsString("does <strong>not</strong> delete your Google account")))
                .andExpect(content().string(containsString("does not automatically delete data")))
                .andExpect(content().string(containsString("does not sell your data")))
                .andExpect(content().string(containsString("does not use your data for advertising")))
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
