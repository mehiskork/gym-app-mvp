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
    @SuppressWarnings("resource")
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
    void readyFailsWhenRequiredAccountTableIsMissing() throws Exception {
        jdbcTemplate.execute("DROP TABLE identity_link");
        try {
            mockMvc.perform(get("/ready"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("not_ready"))
                    .andExpect(jsonPath("$.checks.database").value(true))
                    .andExpect(jsonPath("$.checks.requiredTables").value(false))
                    .andExpect(jsonPath("$.missingTables[0]").value("identity_link"));
        } finally {
            jdbcTemplate.execute(
                    "CREATE TABLE identity_link ("
                            + "guest_user_id TEXT PRIMARY KEY,"
                            + "user_id TEXT NOT NULL,"
                            + "created_at TIMESTAMPTZ NOT NULL)");
            jdbcTemplate.execute(
                    "COMMENT ON COLUMN identity_link.guest_user_id IS "
                            + "'Original guest/device owner scope id linked to an account owner.'");
        }
    }

    @Test
    void readyFailsWhenAccountDeletionTombstoneTableIsMissing() throws Exception {
        jdbcTemplate.execute("DROP TABLE account_deletion_tombstone");
        try {
            mockMvc.perform(get("/ready"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("not_ready"))
                    .andExpect(jsonPath("$.checks.database").value(true))
                    .andExpect(jsonPath("$.checks.requiredTables").value(false))
                    .andExpect(jsonPath("$.missingTables[0]").value("account_deletion_tombstone"));
        } finally {
            jdbcTemplate.execute(
                    "CREATE TABLE account_deletion_tombstone ("
                            + "account_owner_id TEXT PRIMARY KEY,"
                            + "deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),"
                            + "deletion_reason TEXT NOT NULL DEFAULT 'user_delete_me',"
                            + "cleared_at TIMESTAMPTZ NULL,"
                            + "cleared_by TEXT NULL,"
                            + "clear_reason TEXT NULL)");
            jdbcTemplate.execute(
                    "CREATE INDEX idx_account_deletion_tombstone_active "
                            + "ON account_deletion_tombstone (account_owner_id) WHERE cleared_at IS NULL");
        }
    }

    @Test
    void readyFailsWhenAccountIdentityTableIsMissing() throws Exception {
        jdbcTemplate.execute("DROP TABLE account_identity");
        try {
            mockMvc.perform(get("/ready"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("not_ready"))
                    .andExpect(jsonPath("$.checks.database").value(true))
                    .andExpect(jsonPath("$.checks.requiredTables").value(false))
                    .andExpect(jsonPath("$.missingTables[0]").value("account_identity"));
        } finally {
            jdbcTemplate.execute(
                    "CREATE TABLE account_identity ("
                            + "firebase_subject_id TEXT PRIMARY KEY,"
                            + "active_account_owner_id TEXT NOT NULL,"
                            + "generation INTEGER NOT NULL,"
                            + "auth_time_cutoff TIMESTAMPTZ NULL,"
                            + "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),"
                            + "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),"
                            + "CONSTRAINT account_identity_generation_positive CHECK (generation > 0),"
                            + "CONSTRAINT account_identity_active_owner_not_blank "
                            + "CHECK (length(trim(active_account_owner_id)) > 0))");
            jdbcTemplate.execute(
                    "CREATE INDEX idx_account_identity_active_owner "
                            + "ON account_identity (active_account_owner_id)");
        }
    }

    @Test
    void readyFailsWhenFlywayHistoryContainsFailedMigration() throws Exception {
        jdbcTemplate.update(
                """
                        UPDATE flyway_schema_history
                        SET success = FALSE
                        WHERE installed_rank = (
                            SELECT MAX(installed_rank)
                            FROM flyway_schema_history
                        )
                        """);
        try {
            mockMvc.perform(get("/ready"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.status").value("not_ready"))
                    .andExpect(jsonPath("$.checks.database").value(true))
                    .andExpect(jsonPath("$.checks.flyway").value(false))
                    .andExpect(jsonPath("$.checks.requiredTables").value(true));
        } finally {
            jdbcTemplate.update("UPDATE flyway_schema_history SET success = TRUE");
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
