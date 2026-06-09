package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SyncControllerValidationIT {

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
                registry.add("sync.maxOpsPerRequest", () -> "2");
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
        void deleteWithoutDeletedAtReturnsValidationError() throws Exception {
                String token = seedDeviceAndToken("device-delete-missing");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-1","entityType":"program","entityId":"program-1","opType":"delete","payload":{}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-1"));
        }

        @Test
        void deleteWithInvalidDeletedAtReturnsValidationError() throws Exception {
                String token = seedDeviceAndToken("device-delete-invalid");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-2","entityType":"program","entityId":"program-2","opType":"delete","payload":{"deleted_at":"not-a-timestamp"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-2"));
        }

        @Test
        void deleteWithSqliteDeletedAtIsAccepted() throws Exception {
                String token = seedDeviceAndToken("device-delete-sqlite");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-4","entityType":"program","entityId":"program-4","opType":"delete","payload":{"deleted_at":"2026-02-13 12:34:56"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-4"));
        }

        @Test
        void upsertWithInvalidUpdatedAtReturnsValidationError() throws Exception {
                String token = seedDeviceAndToken("device-upsert-invalid-updated-at");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-5","entityType":"program","entityId":"program-5","opType":"upsert","payload":{"updated_at":"not-a-timestamp"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-5"))
                                .andExpect(jsonPath("$.details.field").value("updated_at"));
        }

        @Test
        void upsertWithSqliteUpdatedAtIsAccepted() throws Exception {
                String token = seedDeviceAndToken("device-upsert-sqlite-updated-at");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-6","entityType":"program","entityId":"program-6","opType":"upsert","payload":{"updated_at":"2026-02-13 12:34:56"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-6"));
        }

        @Test
        void upsertWithMatchingPayloadIdIsAccepted() throws Exception {
                String token = seedDeviceAndToken("device-upsert-matching-id");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-matching-id","entityType":"program","entityId":"program-matching-id","opType":"upsert","payload":{"id":"program-matching-id","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-matching-id"));
        }

        @Test
        void upsertWithMissingPayloadIdIsAcceptedAndInjectsEntityId() throws Exception {
                String deviceId = "device-upsert-missing-id";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-missing-id","entityType":"program","entityId":"program-missing-id","opType":"upsert","payload":{"updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-missing-id"));

                assertThat(storedPayloadId(guestUserIdForDevice(deviceId), "program", "program-missing-id"))
                                .isEqualTo("program-missing-id");
        }

        @Test
        void upsertWithMismatchedPayloadIdReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-upsert-mismatched-id";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-mismatch-upsert","entityType":"program","entityId":"program-a","opType":"upsert","payload":{"id":"program-b","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                MvcResult result = mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-mismatch-upsert"))
                                .andExpect(jsonPath("$.details.field").value("payload.id"))
                                .andReturn();

                assertThat(result.getResponse().getContentAsString())
                                .doesNotContain("SELECT")
                                .doesNotContain("INSERT")
                                .doesNotContain("Exception")
                                .doesNotContain("stack");
                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void deleteWithMismatchedPayloadIdReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-delete-mismatched-id";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-mismatch-delete","entityType":"program","entityId":"program-a","opType":"delete","payload":{"id":"program-b","deleted_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-mismatch-delete"))
                                .andExpect(jsonPath("$.details.field").value("payload.id"));

                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void childWithMissingParentReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-child-missing-parent";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-child-missing-parent","entityType":"program_week","entityId":"week-missing-parent","opType":"upsert","payload":{"id":"week-missing-parent","program_id":"missing-program","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                MvcResult result = mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-child-missing-parent"))
                                .andExpect(jsonPath("$.details.entityType").value("program_week"))
                                .andExpect(jsonPath("$.details.field").value("program_id"))
                                .andExpect(jsonPath("$.details.reason")
                                                .value("required parent is missing or inactive"))
                                .andReturn();

                assertThat(result.getResponse().getContentAsString())
                                .doesNotContain("missing-program")
                                .doesNotContain("SELECT")
                                .doesNotContain("INSERT")
                                .doesNotContain("Exception")
                                .doesNotContain("stack");
                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void unsupportedEntityTypeReturnsValidationError() throws Exception {
                String token = seedDeviceAndToken("device-entity-unsupported");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-3","entityType":"unknown_type","entityId":"entity-3","opType":"upsert","payload":{}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.opId").value("op-3"));
        }

        @Test
        void syncRejectsWhenOpsCountExceedsServerGuardrail() throws Exception {
                String token = seedDeviceAndToken("device-ops-max-limit");
                String payload = """
                                {"cursor":null,"ops":[
                                    {"opId":"op-a","entityType":"program","entityId":"program-a","opType":"upsert","payload":{}},
                                    {"opId":"op-b","entityType":"program","entityId":"program-b","opType":"upsert","payload":{}},
                                    {"opId":"op-c","entityType":"program","entityId":"program-c","opType":"upsert","payload":{}}
                                ]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.field").value("ops"))
                                .andExpect(jsonPath("$.details.maxAllowed").value(2))
                                .andExpect(jsonPath("$.details.actual").value(3));
        }

        @Test
        void oversizedSinglePayloadReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-payload-too-large";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-payload-large","entityType":"program","entityId":"program-payload-large","opType":"upsert","payload":{"id":"program-payload-large","name":"%s","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """.formatted("a".repeat(8200));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.field").value("payload"));

                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void tooLongStringReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-string-too-long";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-string-long","entityType":"program","entityId":"program-string-long","opType":"upsert","payload":{"id":"program-string-long","name":"%s","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """.formatted("a".repeat(4100));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.reason").value("string exceeds max allowed length"));

                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void nestedPayloadReturnsValidationErrorAndWritesNoSyncRows() throws Exception {
                String deviceId = "device-payload-nested";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-payload-nested","entityType":"program","entityId":"program-payload-nested","opType":"upsert","payload":{"id":"program-payload-nested","name":"Valid","unknown":{"nested":"value"},"updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("SYNC_VALIDATION_ERROR"))
                                .andExpect(jsonPath("$.details.reason").value("payload values must be scalar"));

                assertNoSyncRowsForRejectedOwner(guestUserIdForDevice(deviceId));
        }

        @Test
        void unknownPayloadFieldsAreStrippedBeforeStorage() throws Exception {
                String deviceId = "device-unknown-strip";
                String token = seedDeviceAndToken(deviceId);
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-unknown-strip","entityType":"program","entityId":"program-unknown-strip","opType":"upsert","payload":{"id":"program-unknown-strip","name":"Known","ignored_field":"drop-me","updated_at":"2026-02-13T12:34:56Z"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-unknown-strip"));

                String guestUserId = guestUserIdForDevice(deviceId);
                assertThat(storedPayloadText("entity_state", guestUserId, "program", "program-unknown-strip",
                                "ignored_field")).isNull();
                assertThat(storedPayloadText("change_log", guestUserId, "program", "program-unknown-strip",
                                "ignored_field")).isNull();
                assertThat(storedPayloadText("entity_state", guestUserId, "program", "program-unknown-strip",
                                "name")).isEqualTo("Known");
        }

        @Test
        void programDayExercisePlannedCardioFieldsAreAcceptedAndStored() throws Exception {
                String deviceId = "device-planned-cardio";
                String token = seedDeviceAndToken(deviceId);
                String parentPayload = """
                                {"cursor":null,"ops":[
                                  {"opId":"op-program-cardio","entityType":"program","entityId":"program-cardio","opType":"upsert","payload":{"id":"program-cardio","name":"Cardio Plan","updated_at":"2026-02-13T12:34:56Z"}},
                                  {"opId":"op-week-cardio","entityType":"program_week","entityId":"week-cardio","opType":"upsert","payload":{"id":"week-cardio","program_id":"program-cardio","week_index":1,"updated_at":"2026-02-13T12:34:56Z"}}
                                ]}
                                """;
                String cardioPayload = """
                                {"cursor":null,"ops":[
                                  {"opId":"op-day-cardio","entityType":"program_day","entityId":"day-cardio","opType":"upsert","payload":{"id":"day-cardio","program_week_id":"week-cardio","day_index":1,"updated_at":"2026-02-13T12:34:56Z"}},
                                  {"opId":"op-pde-cardio","entityType":"program_day_exercise","entityId":"pde-cardio","opType":"upsert","payload":{"id":"pde-cardio","program_day_id":"day-cardio","exercise_id":"ex_rowing_machine","position":1,"planned_cardio_duration_minutes":11,"planned_cardio_distance_km":11,"planned_cardio_speed_kph":12,"planned_cardio_incline_percent":3,"planned_cardio_resistance_level":7,"planned_cardio_pace_seconds_per_km":330,"planned_cardio_floors":20,"planned_cardio_stair_level":5,"ignored_field":"drop-me","updated_at":"2026-02-13T12:34:56Z"}}
                                ]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(parentPayload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].status").value("applied"))
                                .andExpect(jsonPath("$.acks[1].status").value("applied"));

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(cardioPayload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[1].opId").value("op-pde-cardio"))
                                .andExpect(jsonPath("$.acks[1].status").value("applied"));

                String guestUserId = guestUserIdForDevice(deviceId);
                assertThat(storedPayloadText("entity_state", guestUserId, "program_day_exercise", "pde-cardio",
                                "planned_cardio_duration_minutes")).isEqualTo("11");
                assertThat(storedPayloadText("change_log", guestUserId, "program_day_exercise", "pde-cardio",
                                "planned_cardio_distance_km")).isEqualTo("11");
                assertThat(storedPayloadText("entity_state", guestUserId, "program_day_exercise", "pde-cardio",
                                "planned_cardio_pace_seconds_per_km")).isEqualTo("330");
                assertThat(storedPayloadText("entity_state", guestUserId, "program_day_exercise", "pde-cardio",
                                "ignored_field")).isNull();
        }

        @Test
        void validMobileShapedPayloadStillSyncs() throws Exception {
                String token = seedDeviceAndToken("device-valid-mobile-payload");
                String payload = """
                                {"cursor":null,"ops":[{"opId":"op-mobile-valid","entityType":"exercise","entityId":"ex_custom_valid_mobile","opType":"upsert","payload":{"id":"ex_custom_valid_mobile","name":"Bench Press","normalized_name":"bench press","is_custom":1,"owner_user_id":"usr_123","equipment":"barbell","primary_muscle":"chest","notes":null,"exercise_type":"strength","cardio_profile":null,"created_at":"2026-02-13 12:00:00","updated_at":"2026-02-13 12:34:56","deleted_at":null,"version":1,"last_modified_by_device_id":"dev_123"}}]}
                                """;

                mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(payload))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.acks[0].opId").value("op-mobile-valid"))
                                .andExpect(jsonPath("$.acks[0].status").value("applied"));
        }

        private String seedDeviceAndToken(String deviceId) {
                String guestUserId = guestUserIdForDevice(deviceId);
                String rawToken = "token-" + deviceId;
                insertDevice(deviceId, guestUserId);
                insertToken(rawToken, deviceId, Instant.now().plusSeconds(3600));
                return rawToken;
        }

        private String guestUserIdForDevice(String deviceId) {
                return "guest-" + deviceId;
        }

        private void assertNoSyncRowsForRejectedOwner(String guestUserId) {
                assertThat(countOwnerRows("entity_state", guestUserId)).isZero();
                assertThat(countOwnerRows("change_log", guestUserId)).isZero();
                assertThat(countOwnerRows("op_ledger", guestUserId)).isZero();
        }

        private Long countOwnerRows(String table, String guestUserId) {
                return jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM " + table + " WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
        }

        private String storedPayloadId(String guestUserId, String entityType, String entityId) {
                return jdbcTemplate.queryForObject(
                                """
                                                SELECT row_json ->> 'id'
                                                FROM entity_state
                                                WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?
                                                """,
                                String.class,
                                guestUserId,
                                entityType,
                                entityId);
        }

        private String storedPayloadText(String table, String guestUserId, String entityType, String entityId,
                        String field) {
                return jdbcTemplate.queryForObject(
                                "SELECT row_json ->> ? FROM " + table
                                                + " WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?",
                                String.class,
                                field,
                                guestUserId,
                                entityType,
                                entityId);
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
