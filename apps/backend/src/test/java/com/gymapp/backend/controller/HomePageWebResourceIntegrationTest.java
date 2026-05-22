package com.gymapp.backend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
class HomePageWebResourceIntegrationTest {
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
        registry.add("trainframe.support.email", () -> "home@trainframe.example");
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
    void homePageIsPublicAndContainsRequiredCopy() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(content().string(containsString("TrainFrame")))
                .andExpect(content().string(containsString(
                        "offline-first workout tracker for planning workouts, logging sessions, and optional Google Sign-In sync")))
                .andExpect(content().string(containsString("home@trainframe.example")))
                .andExpect(content().string(containsString("/privacy")))
                .andExpect(content().string(containsString("/terms")))
                .andExpect(content().string(containsString("/account-deletion")))
                .andExpect(content().string(containsString("/assets/trainframe-logo.png")))
                .andExpect(content().string(containsString("TrainFrame TF logo")));
    }

    @Test
    void logoAssetIsPublicAndReceivesSecurityHeaders() throws Exception {
        mockMvc.perform(get("/assets/trainframe-logo.png"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_PNG))
                .andExpect(header().string("Content-Security-Policy", PUBLIC_WEB_CSP))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }
}
