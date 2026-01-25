package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gymapp.backend.model.SyncAck;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.DeviceRepository;
import com.gymapp.backend.repository.DeviceTokenRepository;
import com.gymapp.backend.repository.SyncRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SyncServiceConflictTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine");

    @DynamicPropertySource
    static void registerDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private SyncService syncService;

    @Autowired
    private SyncRepository syncRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private DeviceTokenRepository deviceTokenRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final String GUEST_USER_ID = "guest-user-1";

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM change_log");
        jdbcTemplate.update("DELETE FROM entity_state");
        jdbcTemplate.update("DELETE FROM op_ledger");
        jdbcTemplate.update("DELETE FROM device_token");
        jdbcTemplate.update("DELETE FROM device");
    }

    @Test
    void newerUpdateBeatsOlderUpdate() {
        registerDevice("device-a", "token-a");
        registerDevice("device-b", "token-b");

        SyncOp older = new SyncOp(
                "op-older",
                "program",
                "program-1",
                "upsert",
                payload("program-1", "device-a", "2024-01-01T00:00:00Z", "alpha"),
                null);
        syncService.sync("token-a", null, List.of(older));

        SyncOp newer = new SyncOp(
                "op-newer",
                "program",
                "program-1",
                "upsert",
                payload("program-1", "device-b", "2024-01-02T00:00:00Z", "beta"),
                null);
        syncService.sync("token-b", null, List.of(newer));

        JsonNode stored = getEntity("program", "program-1");
        assertThat(stored.get("name").asText()).isEqualTo("beta");
    }

    @Test
    void tieBreakUsesDeviceIdWhenUpdatedAtEqual() {
        registerDevice("device-a", "token-a");
        registerDevice("device-b", "token-b");

        String timestamp = "2024-02-01T10:00:00Z";
        SyncOp first = new SyncOp(
                "op-first",
                "program",
                "program-2",
                "upsert",
                payload("program-2", "device-a", timestamp, "alpha"),
                null);
        syncService.sync("token-a", null, List.of(first));

        SyncOp second = new SyncOp(
                "op-second",
                "program",
                "program-2",
                "upsert",
                payload("program-2", "device-b", timestamp, "beta"),
                null);
        syncService.sync("token-b", null, List.of(second));

        JsonNode stored = getEntity("program", "program-2");
        assertThat(stored.get("name").asText()).isEqualTo("beta");
    }

    @Test
    void deleteWinsWithNoResurrection() {
        registerDevice("device-a", "token-a");

        SyncOp create = new SyncOp(
                "op-create",
                "program",
                "program-3",
                "upsert",
                payload("program-3", "device-a", "2024-03-01T00:00:00Z", "alpha"),
                null);
        syncService.sync("token-a", null, List.of(create));

        ObjectNode deletePayload = payload("program-3", "device-a", "2024-03-02T00:00:00Z", "alpha");
        deletePayload.put("deleted_at", "2024-03-02T00:00:00Z");
        SyncOp delete = new SyncOp(
                "op-delete",
                "program",
                "program-3",
                "delete",
                deletePayload,
                null);
        syncService.sync("token-a", null, List.of(delete));

        SyncOp update = new SyncOp(
                "op-update",
                "program",
                "program-3",
                "upsert",
                payload("program-3", "device-a", "2024-03-03T00:00:00Z", "beta"),
                null);
        SyncResponse response = syncService.sync("token-a", null, List.of(update));

        SyncAck ack = response.acks().get(0);
        assertThat(ack.status()).isEqualTo("noop");
        assertThat(ack.reason()).contains("delete wins");

        JsonNode stored = getEntity("program", "program-3");
        assertThat(stored.get("deleted_at").asText()).isEqualTo("2024-03-02T00:00:00Z");
    }

    @Test
    void completedSessionRejectsWorkoutSetUpdate() {
        registerDevice("device-a", "token-a");

        SyncOp session = new SyncOp(
                "op-session",
                "workout_session",
                "session-1",
                "upsert",
                payload("session-1", "device-a", "2024-04-01T00:00:00Z", "session")
                        .put("status", "completed"),
                null);
        syncService.sync("token-a", null, List.of(session));

        ObjectNode wsePayload = payload("wse-1", "device-a", "2024-04-01T01:00:00Z", "wse");
        wsePayload.put("workout_session_id", "session-1");
        SyncOp wse = new SyncOp(
                "op-wse",
                "workout_session_exercise",
                "wse-1",
                "upsert",
                wsePayload,
                null);
        syncService.sync("token-a", null, List.of(wse));

        ObjectNode setPayload = payload("set-1", "device-a", "2024-04-01T02:00:00Z", "set");
        setPayload.put("workout_session_exercise_id", "wse-1");
        setPayload.put("reps", 10);
        SyncOp setUpdate = new SyncOp(
                "op-set",
                "workout_set",
                "set-1",
                "upsert",
                setPayload,
                null);

        SyncResponse response = syncService.sync("token-a", null, List.of(setUpdate));
        SyncAck ack = response.acks().get(0);
        assertThat(ack.status()).isEqualTo("rejected");
        assertThat(ack.reason()).contains("immutable");
    }

    @Test
    void integrationResolvesTwoDeviceConflicts() {
        registerDevice("device-a", "token-a");
        registerDevice("device-b", "token-b");

        SyncOp newer = new SyncOp(
                "op-a",
                "program",
                "program-4",
                "upsert",
                payload("program-4", "device-a", "2024-05-02T00:00:00Z", "alpha"),
                null);
        syncService.sync("token-a", null, List.of(newer));

        SyncOp older = new SyncOp(
                "op-b",
                "program",
                "program-4",
                "upsert",
                payload("program-4", "device-b", "2024-05-01T00:00:00Z", "beta"),
                null);
        syncService.sync("token-b", null, List.of(older));

        JsonNode stored = getEntity("program", "program-4");
        assertThat(stored.get("name").asText()).isEqualTo("alpha");

        SyncOp create = new SyncOp(
                "op-create-2",
                "program",
                "program-5",
                "upsert",
                payload("program-5", "device-a", "2024-06-01T00:00:00Z", "gamma"),
                null);
        syncService.sync("token-a", null, List.of(create));

        ObjectNode deletePayload = payload("program-5", "device-a", "2024-06-02T00:00:00Z", "gamma");
        deletePayload.put("deleted_at", "2024-06-02T00:00:00Z");
        SyncOp delete = new SyncOp(
                "op-delete-2",
                "program",
                "program-5",
                "delete",
                deletePayload,
                null);
        syncService.sync("token-a", null, List.of(delete));

        SyncOp updateAfterDelete = new SyncOp(
                "op-update-2",
                "program",
                "program-5",
                "upsert",
                payload("program-5", "device-b", "2024-06-03T00:00:00Z", "delta"),
                null);
        syncService.sync("token-b", null, List.of(updateAfterDelete));

        JsonNode deleted = getEntity("program", "program-5");
        assertThat(deleted.get("deleted_at").asText()).isEqualTo("2024-06-02T00:00:00Z");
    }

    private void registerDevice(String deviceId, String token) {
        deviceRepository.insertDevice(deviceId, "secret", GUEST_USER_ID);
        deviceTokenRepository.insertToken(passwordEncoder.encode(token), deviceId);
    }

    private ObjectNode payload(String id, String deviceId, String updatedAt, String name) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("id", id);
        payload.put("last_modified_by_device_id", deviceId);
        payload.put("updated_at", updatedAt);
        payload.put("name", name);
        return payload;
    }

    private JsonNode getEntity(String entityType, String entityId) {
        Optional<JsonNode> stored = syncRepository.findEntityState(GUEST_USER_ID, entityType, entityId);
        assertThat(stored).isPresent();
        return stored.get();
    }
}