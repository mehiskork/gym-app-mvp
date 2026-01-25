package com.gymapp.backend.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gymapp.backend.model.SyncDelta;
import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.StringJoiner;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SyncRepository {
        private final JdbcTemplate jdbcTemplate;
        private final ObjectMapper objectMapper;

        public boolean opExists(String opId) {
                Integer count = jdbcTemplate.queryForObject(
                                """
                                                SELECT COUNT(*)
                                                FROM op_ledger
                                                WHERE op_id = ?
                                                """,
                                Integer.class,
                                opId);
                return count != null && count > 0;
        }

        public void insertOpLedger(String opId, String deviceId, String guestUserId, Instant receivedAt) {
                jdbcTemplate.update(
                                """
                                                  INSERT INTO op_ledger (op_id, device_id, guest_user_id, received_at)
                                                VALUES (?, ?, ?, ?)
                                                """,
                                opId,
                                deviceId,
                                guestUserId,
                                receivedAt);
        }

        public void upsertEntityState(String guestUserId, String entityType, String entityId, JsonNode payload,
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
                                receivedAt);
        }

        public void deleteEntityState(String guestUserId, String entityType, String entityId, JsonNode payload,
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
                                receivedAt);
        }

        public void insertChangeLog(String guestUserId, String entityType, String entityId, String opType,
                        JsonNode payload) {
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

        public Optional<JsonNode> findEntityState(String guestUserId, String entityType, String entityId) {
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

                                (rs, rowNum) -> new EntityStateRecord(
                                                parseJson(rs.getString("row_json")),
                                                rs.getTimestamp("last_received_at").toInstant()),
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

        public long fetchMaxChangeId(String guestUserId, long cursor, int limit) {
                Long maxChangeId = jdbcTemplate.queryForObject(
                                """
                                                SELECT MAX(change_id) AS max_id
                                                FROM (
                                                    SELECT change_id
                                                    FROM change_log
                                                    WHERE guest_user_id = ? AND change_id > ?
                                                    ORDER BY change_id ASC
                                                    LIMIT ?
                                                ) AS limited_changes
                                                """,
                                Long.class,
                                guestUserId,
                                cursor,
                                limit);
                return maxChangeId == null ? cursor : maxChangeId;
        }

        private String toJson(JsonNode payload) {
                try {
                        return objectMapper.writeValueAsString(payload);
                } catch (JsonProcessingException ex) {
                        throw new IllegalArgumentException("Invalid payload JSON", ex);
                }
        }

        private JsonNode parseJson(String json) {
                try {
                        return objectMapper.readTree(json);
                } catch (JsonProcessingException ex) {
                        throw new IllegalArgumentException("Unable to parse stored JSON", ex);
                }
        }

        public record EntityStateRecord(JsonNode payload, Instant lastReceivedAt) {
        }
}