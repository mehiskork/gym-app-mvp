package com.gymapp.backend.repository;

import com.gymapp.backend.model.ClaimStatus;
import com.gymapp.backend.model.ClaimType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ClaimRepository {
    private final JdbcTemplate jdbcTemplate;

    public void insertClaim(
            UUID claimId,
            ClaimType claimType,
            String secretHash,
            String guestUserId,
            String deviceId,
            ClaimStatus status,
            Instant createdAt,
            Instant expiresAt) {
        jdbcTemplate.update(
                """
                        INSERT INTO claim (
                            claim_id,
                            claim_type,
                            secret_hash,
                            guest_user_id,
                            device_id,
                            status,
                            created_at,
                            expires_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                claimId,
                claimType.name(),
                secretHash,
                guestUserId,
                deviceId,
                status.name(),
                toTimestamp(createdAt),
                toTimestamp(expiresAt));
    }

    public int expirePendingClaimsForGuestDevice(
            String guestUserId,
            String deviceId,
            ClaimType claimType) {
        return jdbcTemplate.update(
                """
                        UPDATE claim
                        SET status = ?
                        WHERE guest_user_id = ?
                          AND device_id = ?
                          AND claim_type = ?
                          AND status = ?
                        """,
                ClaimStatus.CANCELLED.name(),
                guestUserId,
                deviceId,
                claimType.name(),
                ClaimStatus.PENDING.name());
    }

    public List<ClaimRecord> findClaimCandidates(ClaimType claimType, Instant createdAfter) {
        return jdbcTemplate.query(
                """
                        SELECT claim_id,
                               claim_type,
                               secret_hash,
                               guest_user_id,
                               device_id,
                               status,
                               created_at,
                               expires_at,
                               claimed_at,
                               claimed_by_user_id
                        FROM claim
                        WHERE claim_type = ?
                          AND status IN (?, ?)
                          AND created_at >= ?
                        ORDER BY created_at DESC
                        """,
                (rs, rowNum) -> mapClaim(rs),
                claimType.name(),
                ClaimStatus.PENDING.name(),
                ClaimStatus.CLAIMED.name(),
                toTimestamp(createdAfter));
    }

    public int markExpired(UUID claimId) {
        return jdbcTemplate.update(
                """
                        UPDATE claim
                        SET status = ?
                        WHERE claim_id = ?
                          AND status = ?
                        """,
                ClaimStatus.EXPIRED.name(),
                claimId,
                ClaimStatus.PENDING.name());
    }

    public int markClaimed(UUID claimId, String claimedByUserId, Instant claimedAt) {
        return jdbcTemplate.update(
                """
                        UPDATE claim
                        SET status = ?,
                            claimed_at = ?,
                            claimed_by_user_id = ?
                        WHERE claim_id = ?
                          AND status = ?
                        """,
                ClaimStatus.CLAIMED.name(),
                toTimestamp(claimedAt),
                claimedByUserId,
                claimId,
                ClaimStatus.PENDING.name());
    }

    private ClaimRecord mapClaim(ResultSet rs) throws SQLException {
        return new ClaimRecord(
                rs.getObject("claim_id", UUID.class),
                ClaimType.valueOf(rs.getString("claim_type")),
                rs.getString("secret_hash"),
                rs.getString("guest_user_id"),
                rs.getString("device_id"),
                ClaimStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                toInstant(rs.getTimestamp("claimed_at")),
                rs.getString("claimed_by_user_id"));
    }

    private Instant toInstant(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
    }

    private Timestamp toTimestamp(Instant instant) {
        return Timestamp.from(instant);
    }

    public record ClaimRecord(
            UUID claimId,
            ClaimType claimType,
            String secretHash,
            String guestUserId,
            String deviceId,
            ClaimStatus status,
            Instant createdAt,
            Instant expiresAt,
            Instant claimedAt,
            String claimedByUserId) {
    }
}