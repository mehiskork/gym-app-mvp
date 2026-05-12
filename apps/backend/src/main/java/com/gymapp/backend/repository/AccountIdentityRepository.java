package com.gymapp.backend.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class AccountIdentityRepository {
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final JdbcTemplate plainJdbcTemplate;

    public void lockFirebaseSubjectForTransaction(String firebaseSubjectId) {
        plainJdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 1))",
                rs -> null,
                firebaseSubjectId);
    }

    public Optional<AccountIdentityRecord> findByFirebaseSubjectId(String firebaseSubjectId) {
        return jdbcTemplate.query(
                """
                        SELECT firebase_subject_id,
                               active_account_owner_id,
                               generation,
                               auth_time_cutoff,
                               created_at,
                               updated_at
                        FROM account_identity
                        WHERE firebase_subject_id = :firebaseSubjectId
                        """,
                Map.of("firebaseSubjectId", firebaseSubjectId),
                (rs, rowNum) -> new AccountIdentityRecord(
                        rs.getString("firebase_subject_id"),
                        rs.getString("active_account_owner_id"),
                        rs.getInt("generation"),
                        toInstant(rs.getTimestamp("auth_time_cutoff")),
                        toInstant(rs.getTimestamp("created_at")),
                        toInstant(rs.getTimestamp("updated_at"))))
                .stream()
                .findFirst();
    }

    public AccountIdentityRecord createLegacyIdentityIfAbsent(String firebaseSubjectId, Instant now) {
        jdbcTemplate.update(
                """
                        INSERT INTO account_identity (
                            firebase_subject_id,
                            active_account_owner_id,
                            generation,
                            auth_time_cutoff,
                            created_at,
                            updated_at
                        )
                        VALUES (:firebaseSubjectId, :firebaseSubjectId, 1, NULL, :now, :now)
                        ON CONFLICT (firebase_subject_id) DO NOTHING
                        """,
                Map.of(
                        "firebaseSubjectId", firebaseSubjectId,
                        "now", Timestamp.from(now)));
        return findByFirebaseSubjectId(firebaseSubjectId)
                .orElseThrow(() -> new IllegalStateException("Account identity was not created"));
    }

    public AccountIdentityRecord createRecreatedIdentity(
            String firebaseSubjectId,
            String activeAccountOwnerId,
            int generation,
            Instant authTimeCutoff,
            Instant now) {
        jdbcTemplate.update(
                """
                        INSERT INTO account_identity (
                            firebase_subject_id,
                            active_account_owner_id,
                            generation,
                            auth_time_cutoff,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :firebaseSubjectId,
                            :activeAccountOwnerId,
                            :generation,
                            :authTimeCutoff,
                            :now,
                            :now
                        )
                        ON CONFLICT (firebase_subject_id)
                        DO UPDATE SET
                            active_account_owner_id = EXCLUDED.active_account_owner_id,
                            generation = EXCLUDED.generation,
                            auth_time_cutoff = EXCLUDED.auth_time_cutoff,
                            updated_at = EXCLUDED.updated_at
                        """,
                Map.of(
                        "firebaseSubjectId", firebaseSubjectId,
                        "activeAccountOwnerId", activeAccountOwnerId,
                        "generation", generation,
                        "authTimeCutoff", Timestamp.from(authTimeCutoff),
                        "now", Timestamp.from(now)));
        return findByFirebaseSubjectId(firebaseSubjectId)
                .orElseThrow(() -> new IllegalStateException("Account identity was not recreated"));
    }

    public void updateAuthTimeCutoff(String firebaseSubjectId, Instant authTimeCutoff, Instant now) {
        jdbcTemplate.update(
                """
                        UPDATE account_identity
                        SET auth_time_cutoff = :authTimeCutoff,
                            updated_at = :now
                        WHERE firebase_subject_id = :firebaseSubjectId
                        """,
                Map.of(
                        "firebaseSubjectId", firebaseSubjectId,
                        "authTimeCutoff", Timestamp.from(authTimeCutoff),
                        "now", Timestamp.from(now)));
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    public record AccountIdentityRecord(
            String firebaseSubjectId,
            String activeAccountOwnerId,
            int generation,
            Instant authTimeCutoff,
            Instant createdAt,
            Instant updatedAt) {
    }
}
