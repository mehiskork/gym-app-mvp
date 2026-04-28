package com.gymapp.backend.service;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ReadinessService {
    private static final Set<String> REQUIRED_TABLES = Set.of(
            "flyway_schema_history",
            "device",
            "device_token",
            "entity_state",
            "change_log",
            "op_ledger");

    private final DataSource dataSource;

    public ReadinessResult checkReadiness() {
        Map<String, Boolean> checks = new LinkedHashMap<>();
        List<String> missingTables = new ArrayList<>();

        boolean databaseReachable = false;
        boolean flywayReady = false;
        boolean requiredTablesReady = false;

        try {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            databaseReachable = true;

            Map<String, String> discoveredTables = discoverTableNames();
            missingTables = REQUIRED_TABLES.stream()
                    .filter(required -> !discoveredTables.containsKey(required))
                    .sorted()
                    .toList();
            requiredTablesReady = missingTables.isEmpty();

            if (requiredTablesReady) {
                Integer successfulMigrations = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE success = TRUE",
                        Integer.class);
                flywayReady = successfulMigrations != null && successfulMigrations > 0;
            }
        } catch (Exception ignored) {
            // Safe readiness response intentionally omits exception internals.
        }

        checks.put("database", databaseReachable);
        checks.put("flyway", flywayReady);
        checks.put("requiredTables", requiredTablesReady);

        return new ReadinessResult(databaseReachable && flywayReady && requiredTablesReady, checks, missingTables);
    }

    private Map<String, String> discoverTableNames() throws Exception {
        Map<String, String> discoveredTables = new LinkedHashMap<>();
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData metaData = connection.getMetaData();
            try (ResultSet tables = metaData.getTables(null, null, "%", new String[] { "TABLE" })) {
                while (tables.next()) {
                    String tableName = tables.getString("TABLE_NAME");
                    if (tableName != null) {
                        discoveredTables.put(tableName.toLowerCase(Locale.ROOT), tableName);
                    }
                }
            }
        }
        return discoveredTables;
    }

    public record ReadinessResult(boolean ready, Map<String, Boolean> checks, List<String> missingTables) {
    }
}