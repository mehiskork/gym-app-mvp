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

        public MigrationAuditState registerGuestToAccountMigrationAttempt(
                        String guestOwnerId,
                        String accountOwnerId,
                        Instant attemptedAt) {
                return jdbcTemplate.queryForObject(
                                """
                                                INSERT INTO guest_account_migration_audit (
                                                        guest_user_id,
                                                        user_id,
                                                        first_attempted_at,
                                                        last_attempted_at,
                                                        attempt_count
                                                )
                                                VALUES (?, ?, ?, ?, 1)
                                                ON CONFLICT (guest_user_id) DO UPDATE
                                                SET last_attempted_at = EXCLUDED.last_attempted_at,
                                                        attempt_count = guest_account_migration_audit.attempt_count + 1
                                                RETURNING user_id, completed_at, attempt_count
                                                """,
                                (rs, rowNum) -> new MigrationAuditState(
                                                rs.getString("user_id"),
                                                toInstant(rs.getTimestamp("completed_at")),
                                                rs.getLong("attempt_count")),
                                guestOwnerId,
                                accountOwnerId,
                                toTimestamp(attemptedAt),
                                toTimestamp(attemptedAt));
        }

        public GuestToAccountMigrationCounts migrateGuestOwnedSyncDataToAccountOwner(
                        String guestOwnerId,
                        String accountOwnerId) {
                int entityConflictsResolved = jdbcTemplate.queryForObject(
                                """
                                                SELECT COUNT(*)
                                                FROM entity_state guest_state
                                                JOIN entity_state account_state
                                                  ON account_state.guest_user_id = ?
                                                 AND account_state.entity_type = guest_state.entity_type
                                                 AND account_state.entity_id = guest_state.entity_id
                                                WHERE guest_state.guest_user_id = ?
                                                """,
                                Integer.class,
                                accountOwnerId,
                                guestOwnerId);

                jdbcTemplate.update(
                                """
                                                INSERT INTO entity_state (
                                                        guest_user_id,
                                                        entity_type,
                                                        entity_id,
                                                        row_json,
                                                        updated_at,
                                                        last_received_at
                                                )
                                                SELECT
                                                        ?,
                                                        guest_state.entity_type,
                                                        guest_state.entity_id,
                                                        guest_state.row_json,
                                                        now(),
                                                        guest_state.last_received_at
                                                FROM entity_state guest_state
                                                WHERE guest_state.guest_user_id = ?
                                                ON CONFLICT (guest_user_id, entity_type, entity_id)
                                                DO UPDATE SET
                                                        row_json = CASE
                                                                        WHEN EXCLUDED.last_received_at >= entity_state.last_received_at
                                                                                THEN EXCLUDED.row_json
                                                                        ELSE entity_state.row_json
                                                                END,
                                                        updated_at = now(),
                                                        last_received_at = GREATEST(entity_state.last_received_at,
                                                                        EXCLUDED.last_received_at)
                                                """,
                                accountOwnerId,
                                guestOwnerId);

                int entityRowsMoved = jdbcTemplate.update(
                                """
                                                DELETE FROM entity_state
                                                WHERE guest_user_id = ?
                                                """,
                                guestOwnerId);

                int changeLogRowsMoved = jdbcTemplate.update(
                                """
                                                UPDATE change_log
                                                SET guest_user_id = ?
                                                WHERE guest_user_id = ?
                                                """,
                                accountOwnerId,
                                guestOwnerId);

                int opLedgerRowsMoved = jdbcTemplate.update(
                                """
                                                UPDATE op_ledger
                                                SET guest_user_id = ?
                                                WHERE guest_user_id = ?
                                                """,
                                accountOwnerId,
                                guestOwnerId);

                return new GuestToAccountMigrationCounts(
                                entityRowsMoved,
                                changeLogRowsMoved,
                                opLedgerRowsMoved,
                                entityConflictsResolved);
        }

        public void markGuestToAccountMigrationCompleted(
                        String guestOwnerId,
                        String accountOwnerId,
                        Instant completedAt,
                        GuestToAccountMigrationCounts counts) {
                jdbcTemplate.update(
                                """
                                                UPDATE guest_account_migration_audit
                                                SET completed_at = COALESCE(completed_at, ?),
                                                        entity_state_rows_moved = COALESCE(entity_state_rows_moved, 0) + ?,
                                                        change_log_rows_moved = COALESCE(change_log_rows_moved, 0) + ?,
                                                        op_ledger_rows_moved = COALESCE(op_ledger_rows_moved, 0) + ?,
                                                        entity_conflicts_resolved = COALESCE(entity_conflicts_resolved, 0) + ?
                                                WHERE guest_user_id = ?
                                                  AND user_id = ?
                                                """,
                                toTimestamp(completedAt),
                                counts.entityStateRowsMoved(),
                                counts.changeLogRowsMoved(),
                                counts.opLedgerRowsMoved(),
                                counts.entityConflictsResolved(),
                                guestOwnerId,
                                accountOwnerId);
        }

        public boolean insertOpLedgerIfAbsentForOwner(String opId, String deviceId, String ownerId,
                        Instant receivedAt) {
                return insertOpLedgerIfAbsent(opId, deviceId, ownerId, receivedAt);
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

        public void upsertEntityStateForOwner(String ownerId, String entityType, String entityId,
                        Map<String, Object> payload,
                        Instant receivedAt) {
                upsertEntityState(ownerId, entityType, entityId, payload, receivedAt);
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

        public void insertChangeLogForOwner(String ownerId, String entityType, String entityId, String opType,
                        Map<String, Object> payload) {
                insertChangeLog(ownerId, entityType, entityId, opType, payload);
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

        public Optional<Map<String, Object>> findEntityStateForOwner(String ownerId, String entityType,
                        String entityId) {
                return findEntityState(ownerId, entityType, entityId);
        }

        public Optional<String> findEntityOwnerId(String guestUserId, String entityType, String entityId) {
                return jdbcTemplate.query(
                                """
                                                SELECT guest_user_id
                                                FROM entity_state
                                                WHERE entity_type = ? AND entity_id = ? AND guest_user_id <> ?
                                                """,
                                (rs, rowNum) -> rs.getString("guest_user_id"),
                                entityType,
                                entityId,
                                guestUserId).stream().findFirst();
        }

        public Optional<String> findEntityOwnerIdForOwner(String ownerId, String entityType, String entityId) {
                return findEntityOwnerId(ownerId, entityType, entityId);
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

        public Optional<EntityStateRecord> findEntityStateWithReceivedAtForOwner(String ownerId, String entityType,
                        String entityId) {
                return findEntityStateWithReceivedAt(ownerId, entityType, entityId);
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

        public List<SyncDelta> fetchDeltasForOwner(String ownerId, long cursor, int limit,
                        List<String> allowedEntityTypes) {
                return fetchDeltas(ownerId, cursor, limit, allowedEntityTypes);
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

        private Instant toInstant(Timestamp timestamp) {
                return timestamp == null ? null : timestamp.toInstant();
        }

        public record MigrationAuditState(String linkedUserId, Instant completedAt, long attemptCount) {
                public boolean completed() {
                        return completedAt != null;
                }
        }

        public record GuestToAccountMigrationCounts(
                        int entityStateRowsMoved,
                        int changeLogRowsMoved,
                        int opLedgerRowsMoved,
                        int entityConflictsResolved) {
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
