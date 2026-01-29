package com.gymapp.backend.repository;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.SyncDelta;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SyncRepository {
        private final JdbcTemplate jdbcTemplate;
        private final ObjectMapper objectMapper;

        public void insertOpLedger(String opId, String deviceId, String guestUserId, Instant receivedAt) {
                jdbcTemplate.update(
                                """
                                                  INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                                                VALUES (?, ?, ?, ?)
                                                """,
                                opId,
                                deviceId,
                                guestUserId,
                                toTimestamp(receivedAt));
        }

        public void upsertEntityState(String guestUserId, String entityType, String entityId,
                        Map<String, Object> payload,
                        Instant receivedAt) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO entity_state (guest_user_id, entity_type, entity_id, row_json, last_received_at)
                                                VALUES (?, ?, ?, ?::jsonb, ?)
                                                ON CONFLICT (guest_user_id, entity_type, entity_id)
                                                DO UPDATE SET row_json = EXCLUDED.row_json, updated_at = now(),
                                                  last_received_at = EXCLUDED.last_received_at
                                                """,
                                guestUserId,
                                entityType,
                                entityId,
                                toJson(payload),
                                toTimestamp(receivedAt));
        }

        public void deleteEntityState(String guestUserId, String entityType, String entityId,
                        Map<String, Object> payload,
                        Instant receivedAt) {
                jdbcTemplate.update(
                                """
                                                 INSERT INTO entity_state (guest_user_id, entity_type, entity_id, row_json, last_received_at)
                                                VALUES (?, ?, ?, ?::jsonb, ?)
                                                ON CONFLICT (guest_user_id, entity_type, entity_id)
                                                  DO UPDATE SET row_json = EXCLUDED.row_json, updated_at = now(),
                                                  last_received_at = EXCLUDED.last_received_at
                                                """,
                                guestUserId,
                                entityType,
                                entityId,
                                toJson(payload),
                                toTimestamp(receivedAt));
        }

        public void insertChangeLog(String guestUserId, String entityType, String entityId, String opType,
                        Map<String, Object> payload) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO change_log (guest_user_id, entity_type, entity_id, op_type, row_json)
                                                VALUES (?, ?, ?, ?, ?::jsonb)
                                                """,
                                guestUserId,
                                entityType,
                                entityId,
                                opType,
                                toJson(payload));
        }

        public Optional<Map<String, Object>> findEntityState(String guestUserId, String entityType, String entityId) {
                return jdbcTemplate.query(
                                """
                                                SELECT row_json
                                                FROM entity_state
                                                WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?
                                                """,
                                (rs, rowNum) -> parseJson(rs.getString("row_json")),
                                guestUserId,
                                entityType,
                                entityId).stream().findFirst();
        }

        public Optional<EntityStateRecord> findEntityStateWithReceivedAt(String guestUserId, String entityType,
                        String entityId) {
                return jdbcTemplate.query(
                                """
                                                SELECT row_json, last_received_at
                                                FROM entity_state
                                                WHERE guest_user_id = ? AND entity_type = ? AND entity_id = ?
                                                """,
                                (rs, rowNum) -> {
                                        var ts = rs.getTimestamp("last_received_at");
                                        return new EntityStateRecord(
                                                        parseJson(rs.getString("row_json")),
                                                        ts == null ? null : ts.toInstant());
                                },
                                guestUserId,
                                entityType,
                                entityId).stream().findFirst();
        }

        public List<SyncDelta> fetchDeltas(String guestUserId, long cursor, int limit,
                        List<String> allowedEntityTypes) {
                StringJoiner placeholders = new StringJoiner(", ");
                for (int i = 0; i < allowedEntityTypes.size(); i += 1) {
                        placeholders.add("?");
                }
                String inClause = placeholders.toString();
                Object[] params = new Object[allowedEntityTypes.size() + 3];
                params[0] = guestUserId;
                params[1] = cursor;
                for (int i = 0; i < allowedEntityTypes.size(); i += 1) {
                        params[i + 2] = allowedEntityTypes.get(i);
                }
                params[allowedEntityTypes.size() + 2] = limit;
                String sql = String.format(
                                """
                                                SELECT change_id, entity_type, entity_id, op_type, row_json
                                                FROM change_log
                                                WHERE guest_user_id = ? AND change_id > ?
                                                 AND entity_type IN (%s)
                                                ORDER BY change_id ASC
                                                LIMIT ?
                                                """,
                                inClause);
                return jdbcTemplate.query(
                                sql,
                                (rs, rowNum) -> new SyncDelta(
                                                rs.getLong("change_id"),
                                                rs.getString("entity_type"),
                                                rs.getString("entity_id"),
                                                rs.getString("op_type"),
                                                parseJson(rs.getString("row_json"))),
                                params);
        }

        private String toJson(Map<String, Object> payload) {
                try {
                        return objectMapper.writeValueAsString(payload);
                } catch (Exception ex) {
                        throw new IllegalArgumentException("Invalid payload JSON", ex);
                }
        }

        private Map<String, Object> parseJson(String json) {
                try {
                        if (json == null || json.isBlank()) {
                                return new LinkedHashMap<>();
                        }
                        return objectMapper.readValue(json, new TypeReference<>() {
                        });
                } catch (Exception ex) {
                        throw new IllegalArgumentException("Unable to parse stored JSON", ex);
                }
        }

        private Timestamp toTimestamp(Instant instant) {
                return instant == null ? null : Timestamp.from(instant);
        }

        public record EntityStateRecord(Map<String, Object> payload, Instant lastReceivedAt) {
        }

        public boolean insertOpLedgerIfAbsent(String opId, String deviceId, String guestUserId, Instant receivedAt) {
                int updated = jdbcTemplate.update(
                                """
                                                INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                                                VALUES (?, ?, ?, ?)
                                                ON CONFLICT (op_id) DO NOTHING
                                                """,
                                opId,
                                deviceId,
                                guestUserId,
                                toTimestamp(receivedAt));
                return updated == 1;
        }

}
