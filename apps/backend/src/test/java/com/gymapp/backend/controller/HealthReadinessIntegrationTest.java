package com.gymapp.backend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
class HealthReadinessIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("gymapp")
            .withUsername("gymapp")
            .withPassword("gymapp");

    @DynamicPropertySource
    static void configureDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void readySucceedsWhenRequiredSchemaExists() throws Exception {
        mockMvc.perform(get("/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ready"))
                .andExpect(jsonPath("$.checks.database").value(true))
                .andExpect(jsonPath("$.checks.flyway").value(true))
                .andExpect(jsonPath("$.checks.requiredTables").value(true));
    }

    @Test
    void readyFailsWhenRequiredTableIsMissing() throws Exception {
        jdbcTemplate.execute("DROP TABLE change_log");
        try {
            mockMvc.perform(get("/ready"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("not_ready"))
                    .andExpect(jsonPath("$.checks.database").value(true))
                    .andExpect(jsonPath("$.checks.requiredTables").value(false))
                    .andExpect(jsonPath("$.missingTables[0]").value("change_log"));
        } finally {
            jdbcTemplate.execute(
                    "CREATE TABLE change_log ("
                            + "change_id BIGSERIAL PRIMARY KEY,"
                            + "guest_user_id TEXT NOT NULL,"
                            + "entity_type TEXT NOT NULL,"
                            + "entity_id TEXT NOT NULL,"
                            + "op_type TEXT NOT NULL,"
                            + "row_json JSONB NOT NULL,"
                            + "created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
            jdbcTemplate.execute(
                    "CREATE INDEX idx_change_log_guest_user_change_id ON change_log (guest_user_id, change_id)");
        }
    }

    @Test
    void readyResponseDoesNotExposeSecrets() throws Exception {
        String response = mockMvc.perform(get("/ready"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        org.assertj.core.api.Assertions.assertThat(response)
                .doesNotContain("jdbc:")
                .doesNotContain(postgres.getJdbcUrl())
                .doesNotContain(postgres.getUsername())
                .doesNotContain(postgres.getPassword());
    }
}