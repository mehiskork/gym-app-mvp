package com.gymapp.backend.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceRepository {
    private final JdbcTemplate jdbcTemplate;

    public DeviceRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<DeviceRecord> findById(String deviceId) {
        return jdbcTemplate.query(
                """
                        SELECT device_id, secret_hash, guest_user_id
                        FROM device
                        WHERE device_id = ?
                        """,
                (rs, rowNum) -> mapDevice(rs),
                deviceId).stream().findFirst();
    }

    public void insertDevice(String deviceId, String secretHash, String guestUserId) {
        jdbcTemplate.update(
                """
                        INSERT INTO device (device_id, secret_hash, guest_user_id)
                        VALUES (?, ?, ?)
                        """,
                deviceId,
                secretHash,
                guestUserId);
    }

    public Optional<String> findGuestUserId(String deviceId) {
        return jdbcTemplate.query(
                """
                        SELECT guest_user_id
                        FROM device
                        WHERE device_id = ?
                        """,
                (rs, rowNum) -> rs.getString("guest_user_id"),
                deviceId).stream().findFirst();
    }

    private DeviceRecord mapDevice(ResultSet rs) throws SQLException {
        return new DeviceRecord(
                rs.getString("device_id"),
                rs.getString("secret_hash"),
                rs.getString("guest_user_id"));
    }

    public record DeviceRecord(String deviceId, String secretHash, String guestUserId) {
    }
}