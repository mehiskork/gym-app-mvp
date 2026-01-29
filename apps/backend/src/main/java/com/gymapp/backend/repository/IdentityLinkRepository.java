package com.gymapp.backend.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class IdentityLinkRepository {
    private final JdbcTemplate jdbcTemplate;

    public Optional<String> findUserId(String guestUserId) {
        return jdbcTemplate.query(
                """
                        SELECT user_id
                        FROM identity_link
                        WHERE guest_user_id = ?
                        """,
                (rs, rowNum) -> rs.getString("user_id"),
                guestUserId).stream().findFirst();
    }

    public UpsertResult upsertLink(String guestUserId, String userId, Instant createdAt) {
        int inserted = jdbcTemplate.update(
                """
                        INSERT INTO identity_link (guest_user_id, user_id, created_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT (guest_user_id) DO NOTHING
                        """,
                guestUserId,
                userId,
                Timestamp.from(createdAt));
        if (inserted > 0) {
            return UpsertResult.CREATED;
        }
        Optional<String> existing = findUserId(guestUserId);
        if (existing.isPresent() && existing.get().equals(userId)) {
            return UpsertResult.EXISTING;
        }
        return UpsertResult.CONFLICT;
    }

    public enum UpsertResult {
        CREATED,
        EXISTING,
        CONFLICT
    }
}