package com.gymapp.backend.repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class DeviceTokenRepository {
        private final JdbcTemplate jdbcTemplate;
        private final PasswordEncoder passwordEncoder;

        public void insertToken(String tokenHash, String deviceId, Instant expiresAt) {
                OffsetDateTime expiresAtValue = expiresAt == null
                                ? null
                                : OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
                jdbcTemplate.update(
                                """
                                                INSERT INTO device_token (token_hash, device_id, expires_at)
                                                 VALUES (?, ?, ?)
                                                 """,
                                tokenHash,
                                deviceId,
                                expiresAtValue);
        }

        public DeviceTokenLookupResult findToken(String token, Instant now) {
                List<DeviceTokenRecord> tokens = jdbcTemplate.query(
                                """
                                                SELECT dt.token_hash, dt.device_id, dt.expires_at, d.guest_user_id
                                                FROM device_token dt
                                                JOIN device d ON d.device_id = dt.device_id
                                                """,
                                (rs, rowNum) -> new DeviceTokenRecord(
                                                rs.getString("token_hash"),
                                                rs.getString("device_id"),
                                                rs.getObject("expires_at", OffsetDateTime.class),
                                                rs.getString("guest_user_id")));

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

        private record DeviceTokenRecord(
                        String tokenHash,
                        String deviceId,
                        OffsetDateTime expiresAt,
                        String guestUserId) {
        }
}