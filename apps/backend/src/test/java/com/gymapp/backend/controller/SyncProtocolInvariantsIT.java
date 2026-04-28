package com.gymapp.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
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
class SyncProtocolInvariantsIT {

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
        private ObjectMapper objectMapper;

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
        void freshSyncUsesSnapshotPagingWithoutAdvancingCursorPastReturnedPage() throws Exception {
                RegisteredDevice registeredDevice = registerDevice();
                int deltaLimit = deltaLimit();
                seedEntityStateAndChangeLog(registeredDevice.guestUserId(), deltaLimit + 1);
                long highWater = maxChangeId(registeredDevice.guestUserId());

                JsonNode firstResponse = sync(registeredDevice.deviceToken(), "0", "[]");

                assertThat(firstResponse.path("deltas")).hasSize(deltaLimit);
                assertThat(firstResponse.path("hasMore").asBoolean()).isTrue();
                assertThat(firstResponse.path("cursor").asString())
                                .startsWith("snapshot:" + highWater + ":program:");

                JsonNode secondResponse = sync(
                                registeredDevice.deviceToken(),
                                firstResponse.path("cursor").asString(),
                                "[]");

                assertThat(secondResponse.path("deltas")).hasSize(1);
                assertThat(secondResponse.path("hasMore").asBoolean()).isFalse();
                assertThat(secondResponse.path("cursor").asString()).isEqualTo(String.valueOf(highWater));

                JsonNode thirdResponse = sync(
                                registeredDevice.deviceToken(),
                                secondResponse.path("cursor").asString(),
                                "[]");

                assertThat(thirdResponse.path("deltas")).isEmpty();
                assertThat(thirdResponse.path("hasMore").asBoolean()).isFalse();
        }

        @Test
        void syncTreatsMixedPayloadReplayOfSameOpIdAsIdempotentNoop() throws Exception {
                RegisteredDevice registeredDevice = registerDevice();
                String entityId = "program-op-replay";

                String firstPayload = """
                                [{"opId":"op-1","entityType":"program","entityId":"program-op-replay","opType":"upsert","payload":{"id":"program-op-replay","name":"Program A","updated_at":"2026-02-13T12:34:56Z"}}]
                                """;
                JsonNode firstResponse = sync(registeredDevice.deviceToken(), "0", firstPayload);

                assertThat(firstResponse.path("acks")).hasSize(1);
                assertThat(firstResponse.path("acks").get(0).path("opId").asString()).isEqualTo("op-1");
                assertThat(firstResponse.path("acks").get(0).path("status").asString()).isEqualTo("applied");

                Integer changeLogCountAfterFirst = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM change_log WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?",
                                Integer.class,
                                registeredDevice.guestUserId(),
                                "program",
                                entityId);
                String entityNameAfterFirst = jdbcTemplate.queryForObject(
                                "SELECT row_json ->> 'name' FROM entity_state WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?",
                                String.class,
                                registeredDevice.guestUserId(),
                                "program",
                                entityId);

                assertThat(changeLogCountAfterFirst).isEqualTo(1);
                assertThat(entityNameAfterFirst).isEqualTo("Program A");

                String replayPayload = """
                                [{"opId":"op-1","entityType":"program","entityId":"program-op-replay","opType":"upsert","payload":{"id":"program-op-replay","name":"Program B","updated_at":"2026-02-14T12:34:56Z"}}]
                                """;
                JsonNode replayResponse = sync(registeredDevice.deviceToken(), "0", replayPayload);

                assertThat(replayResponse.path("acks")).hasSize(1);
                assertThat(replayResponse.path("acks").get(0).path("opId").asString()).isEqualTo("op-1");
                assertThat(replayResponse.path("acks").get(0).path("status").asString()).isEqualTo("noop");
                assertThat(replayResponse.path("acks").get(0).path("reason").asString()).isEqualTo("duplicate op");

                Integer changeLogCountAfterReplay = jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM change_log WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?",
                                Integer.class,
                                registeredDevice.guestUserId(),
                                "program",
                                entityId);
                String entityNameAfterReplay = jdbcTemplate.queryForObject(
                                "SELECT row_json ->> 'name' FROM entity_state WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?",
                                String.class,
                                registeredDevice.guestUserId(),
                                "program",
                                entityId);

                assertThat(changeLogCountAfterReplay).isEqualTo(changeLogCountAfterFirst);
                assertThat(entityNameAfterReplay).isEqualTo("Program A");
        }

        private RegisteredDevice registerDevice() throws Exception {
                String deviceId = "device-" + System.nanoTime();
                String requestBody = """
                                {"deviceId":"%s","deviceSecret":"secret"}
                                """.formatted(deviceId);

                MvcResult registrationResult = mockMvc.perform(post("/device/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isOk())
                                .andReturn();

                JsonNode response = objectMapper.readTree(registrationResult.getResponse().getContentAsString());
                return new RegisteredDevice(
                                response.path("deviceToken").asString(),
                                response.path("guestUserId").asString());
        }

        private JsonNode sync(String token, String cursor, String opsJson) throws Exception {
                String body = """
                                {"cursor":"%s","ops":%s}
                                """.formatted(cursor, opsJson);
                MvcResult result = mockMvc.perform(post("/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .header("Authorization", "Bearer " + token)
                                .content(body))
                                .andExpect(status().isOk())
                                .andReturn();

                return objectMapper.readTree(result.getResponse().getContentAsString());
        }

        private void seedEntityStateAndChangeLog(String guestUserId, int count) {
                String stateSql = """
                                INSERT INTO entity_state (guest_user_id, entity_type, entity_id, row_json, last_received_at)
                                VALUES (?, ?, ?, ?::jsonb, ?)
                                """;
                String sql = """
                                INSERT INTO change_log (guest_user_id, entity_type, entity_id, op_type, row_json)
                                VALUES (?, ?, ?, ?, ?::jsonb)
                                """;
                for (int i = 1; i <= count; i += 1) {
                        String entityId = "program-" + i;
                        jdbcTemplate.update(
                                        stateSql,
                                        guestUserId,
                                        "program",
                                        entityId,
                                        "{\"id\":\"" + entityId + "\"}",
                                        OffsetDateTime.now(ZoneOffset.UTC));
                        jdbcTemplate.update(
                                        sql,
                                        guestUserId,
                                        "program",
                                        entityId,
                                        "upsert",
                                        "{\"id\":\"" + entityId + "\"}");
                }
        }

        private long maxChangeId(String guestUserId) {
                Long maxChangeId = jdbcTemplate.queryForObject(
                                "SELECT MAX(change_id) FROM change_log WHERE guest_user_id = ?",
                                Long.class,
                                guestUserId);
                assertThat(maxChangeId).isNotNull();
                return maxChangeId;
        }

        private int deltaLimit() {
                try {
                        Field field = com.gymapp.backend.service.SyncService.class.getDeclaredField("DELTA_LIMIT");
                        field.setAccessible(true);
                        return field.getInt(null);
                } catch (Exception ex) {
                        throw new IllegalStateException("Unable to read delta limit", ex);
                }
        }

        private record RegisteredDevice(String deviceToken, String guestUserId) {
        }
}
