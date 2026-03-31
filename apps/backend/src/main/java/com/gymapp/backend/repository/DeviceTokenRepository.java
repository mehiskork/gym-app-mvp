package com.gymapp.backend.repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import lombok.AccessLevel;
import lombok.extern.slf4j.Slf4j;
import lombok.NoArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Repository;

@Repository
@Slf4j
public class DeviceTokenRepository {
        public static final String TOKEN_LOOKUP_RESULT_REQUEST_ATTRIBUTE = "deviceTokenLookupResult";
        private final JdbcTemplate jdbcTemplate;
        private final PasswordEncoder passwordEncoder;

        public DeviceTokenRepository(JdbcTemplate jdbcTemplate) {
                this(jdbcTemplate, new BCryptPasswordEncoder());
        }

        DeviceTokenRepository(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
                this.jdbcTemplate = jdbcTemplate;
                this.passwordEncoder = passwordEncoder;
        }

        public void insertToken(String tokenHash, String tokenFingerprint, String deviceId, Instant expiresAt) {
                OffsetDateTime expiresAtValue = expiresAt == null
                                ? null
                                : OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
                jdbcTemplate.update(
                                """
                                                 INSERT INTO device_token (token_hash, token_fingerprint, device_id, expires_at)
                                                VALUES (?, ?, ?, ?)
                                                """,
                                tokenHash,
                                tokenFingerprint,
                                deviceId,
                                expiresAtValue);
        }

        public int deleteExpiredTokens(Instant now) {
                OffsetDateTime nowValue = OffsetDateTime.ofInstant(now, ZoneOffset.UTC);
                return jdbcTemplate.update(
                                """
                                                DELETE FROM device_token
                                                WHERE expires_at IS NOT NULL
                                                  AND expires_at < ?
                                                """,
                                nowValue);
        }

        public int deleteTokensByDeviceId(String deviceId) {
                return jdbcTemplate.update(
                                """
                                                DELETE FROM device_token
                                                WHERE device_id = ?
                                                """,
                                deviceId);
        }

        public DeviceTokenLookupResult findToken(String token, Instant now) {
                String tokenFingerprint = TokenFingerprintUtils.fingerprint(token);
                List<DeviceTokenRecord> tokens = jdbcTemplate.query(
                                """
                                                SELECT dt.token_hash, dt.device_id, dt.expires_at, d.guest_user_id
                                                FROM device_token dt
                                                JOIN device d ON d.device_id = dt.device_id
                                                 WHERE dt.token_fingerprint = ?
                                                """,
                                (rs, rowNum) -> new DeviceTokenRecord(
                                                rs.getString("token_hash"),
                                                rs.getString("device_id"),
                                                rs.getObject("expires_at", OffsetDateTime.class),
                                                rs.getString("guest_user_id")),
                                tokenFingerprint);

                if (tokens.isEmpty()) {
                        log.debug("Device token lookup fallback hit for legacy rows without fingerprint");
                        tokens = jdbcTemplate.query(
                                        """
                                                        SELECT dt.token_hash, dt.device_id, dt.expires_at, d.guest_user_id
                                                        FROM device_token dt
                                                        JOIN device d ON d.device_id = dt.device_id
                                                        WHERE dt.token_fingerprint IS NULL
                                                        """,
                                        (rs, rowNum) -> new DeviceTokenRecord(
                                                        rs.getString("token_hash"),
                                                        rs.getString("device_id"),
                                                        rs.getObject("expires_at", OffsetDateTime.class),
                                                        rs.getString("guest_user_id")));
                }

                for (DeviceTokenRecord record : tokens) {
                        if (!passwordEncoder.matches(token, record.tokenHash())) {
                                continue;
                        }
                        if (record.expiresAt() != null && record.expiresAt().toInstant().isBefore(now)) {
                                return DeviceTokenLookupResult.expired(record.deviceId(), record.guestUserId());
                        }
                        return DeviceTokenLookupResult.valid(record.deviceId(), record.guestUserId());
                }

                return DeviceTokenLookupResult.notFound();
        }

        public enum DeviceTokenStatus {
                VALID,
                EXPIRED,
                NOT_FOUND
        }

        public record DeviceTokenLookupResult(DeviceTokenStatus status, String deviceId, String guestUserId) {
                public static DeviceTokenLookupResult valid(String deviceId, String guestUserId) {
                        return new DeviceTokenLookupResult(DeviceTokenStatus.VALID, deviceId, guestUserId);
                }

                public static DeviceTokenLookupResult expired(String deviceId, String guestUserId) {
                        return new DeviceTokenLookupResult(DeviceTokenStatus.EXPIRED, deviceId, guestUserId);
                }

                public static DeviceTokenLookupResult notFound() {
                        return new DeviceTokenLookupResult(DeviceTokenStatus.NOT_FOUND, null, null);
                }
        }

        static record DeviceTokenRecord(
                        String tokenHash,
                        String deviceId,
                        OffsetDateTime expiresAt,
                        String guestUserId) {
        }

        @NoArgsConstructor(access = AccessLevel.PRIVATE)
        public static final class TokenFingerprintUtils {
                public static String fingerprint(String token) {
                        try {
                                var digest = java.security.MessageDigest.getInstance("SHA-256");
                                return HexFormat.of().formatHex(
                                                digest.digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                        } catch (java.security.NoSuchAlgorithmException exception) {
                                throw new IllegalStateException("SHA-256 is unavailable", exception);
                        }
                }
        }
}