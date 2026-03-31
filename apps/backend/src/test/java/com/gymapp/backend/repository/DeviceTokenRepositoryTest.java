package com.gymapp.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;

@SuppressWarnings({ "unchecked" })
@ExtendWith(MockitoExtension.class)
class DeviceTokenRepositoryTest {

        @Mock
        private JdbcTemplate jdbcTemplate;

        @Mock
        private PasswordEncoder passwordEncoder;

        @InjectMocks
        private DeviceTokenRepository repository;

        @Test
        void findTokenUsesFingerprintLookupWithoutLegacyFallbackWhenCandidatesExist() {
                String token = "valid-token";
                String fingerprint = DeviceTokenRepository.TokenFingerprintUtils.fingerprint(token);
                var candidate = new DeviceTokenRecordFixture(
                                "$2a$10$bcryptHash",
                                "device-1",
                                OffsetDateTime.ofInstant(Instant.now().plusSeconds(120), ZoneOffset.UTC),
                                "guest-1");

                when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(fingerprint)))
                                .thenReturn(candidate.asRepositoryRecords());
                when(passwordEncoder.matches(token, candidate.tokenHash())).thenReturn(true);

                var result = repository.findToken(token, Instant.now());

                assertThat(result.status()).isEqualTo(DeviceTokenRepository.DeviceTokenStatus.VALID);
                assertThat(result.deviceId()).isEqualTo("device-1");
                verify(jdbcTemplate, never()).query(eq("""
                                SELECT dt.token_hash, dt.device_id, dt.expires_at, d.guest_user_id
                                FROM device_token dt
                                JOIN device d ON d.device_id = dt.device_id
                                WHERE dt.token_fingerprint IS NULL
                                """), any(RowMapper.class));
        }

        @Test
        void findTokenFallsBackToLegacyRowsWhenFingerprintCandidatesAreMissing() {
                String token = "legacy-token";
                String fingerprint = DeviceTokenRepository.TokenFingerprintUtils.fingerprint(token);
                var legacy = new DeviceTokenRecordFixture(
                                "$2a$10$legacyHash",
                                "device-legacy",
                                OffsetDateTime.ofInstant(Instant.now().plusSeconds(120), ZoneOffset.UTC),
                                "guest-legacy");

                when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(fingerprint)))
                                .thenReturn(List.of());
                when(jdbcTemplate.query(eq("""
                                SELECT dt.token_hash, dt.device_id, dt.expires_at, d.guest_user_id
                                FROM device_token dt
                                JOIN device d ON d.device_id = dt.device_id
                                WHERE dt.token_fingerprint IS NULL
                                """), any(RowMapper.class)))
                                .thenReturn(legacy.asRepositoryRecords());
                when(passwordEncoder.matches(token, legacy.tokenHash())).thenReturn(true);

                var result = repository.findToken(token, Instant.now());

                assertThat(result.status()).isEqualTo(DeviceTokenRepository.DeviceTokenStatus.VALID);
                assertThat(result.deviceId()).isEqualTo("device-legacy");
        }

        @Test
        void findTokenVerifiesAllFingerprintCandidatesUntilMatch() {
                String token = "candidate-token";
                String fingerprint = DeviceTokenRepository.TokenFingerprintUtils.fingerprint(token);
                var nonMatch = new DeviceTokenRecordFixture(
                                "$2a$10$hash1",
                                "device-a",
                                OffsetDateTime.ofInstant(Instant.now().plusSeconds(120), ZoneOffset.UTC),
                                "guest-a");
                var match = new DeviceTokenRecordFixture(
                                "$2a$10$hash2",
                                "device-b",
                                OffsetDateTime.ofInstant(Instant.now().plusSeconds(120), ZoneOffset.UTC),
                                "guest-b");

                when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(fingerprint)))
                                .thenReturn(nonMatch.append(match));
                when(passwordEncoder.matches(token, nonMatch.tokenHash())).thenReturn(false);
                when(passwordEncoder.matches(token, match.tokenHash())).thenReturn(true);

                var result = repository.findToken(token, Instant.now());

                assertThat(result.status()).isEqualTo(DeviceTokenRepository.DeviceTokenStatus.VALID);
                assertThat(result.deviceId()).isEqualTo("device-b");
        }

        private record DeviceTokenRecordFixture(
                        String tokenHash,
                        String deviceId,
                        OffsetDateTime expiresAt,
                        String guestUserId) {

                List<DeviceTokenRepository.DeviceTokenRecord> asRepositoryRecords() {
                        return List.of(new DeviceTokenRepository.DeviceTokenRecord(tokenHash, deviceId, expiresAt,
                                        guestUserId));
                }

                List<DeviceTokenRepository.DeviceTokenRecord> append(DeviceTokenRecordFixture other) {
                        return List.of(
                                        new DeviceTokenRepository.DeviceTokenRecord(tokenHash, deviceId, expiresAt,
                                                        guestUserId),
                                        new DeviceTokenRepository.DeviceTokenRecord(
                                                        other.tokenHash, other.deviceId, other.expiresAt,
                                                        other.guestUserId));
                }
        }
}
