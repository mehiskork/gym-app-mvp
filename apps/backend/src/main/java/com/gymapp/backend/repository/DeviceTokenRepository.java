package com.gymapp.backend.repository;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class DeviceTokenRepository {
        private final JdbcTemplate jdbcTemplate;
        private final PasswordEncoder passwordEncoder;

        public void insertToken(String tokenHash, String deviceId) {
                jdbcTemplate.update(
                                """
                                                INSERT INTO device_token (token_hash, device_id)
                                                VALUES (?, ?)
                                                """,
                                tokenHash,
                                deviceId);
        }

        public Optional<String> findDeviceIdByToken(String token) {
                List<DeviceTokenRecord> tokens = jdbcTemplate.query(
                                """
                                                SELECT token_hash, device_id
                                                FROM device_token
                                                """,
                                (rs, rowNum) -> new DeviceTokenRecord(
                                                rs.getString("token_hash"),
                                                rs.getString("device_id")));

                return tokens.stream()
                                .filter(record -> passwordEncoder.matches(token, record.tokenHash()))
                                .map(DeviceTokenRecord::deviceId)
                                .findFirst();
        }

        private record DeviceTokenRecord(String tokenHash, String deviceId) {
        }
}