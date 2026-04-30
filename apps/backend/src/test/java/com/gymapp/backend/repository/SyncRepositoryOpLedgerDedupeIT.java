package com.gymapp.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
class SyncRepositoryOpLedgerDedupeIT {

    @SuppressWarnings("resource")
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired
    private SyncRepository syncRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @BeforeEach
    void migrateSchema() {
        Flyway.configure()
                .dataSource(dataSource)
                .load()
                .migrate();
    }

    @Test
    void insertOpLedgerIfAbsent_isIdempotent() {
        String opId = "op-" + System.currentTimeMillis();

        boolean first = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());
        boolean second = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());

        assertThat(first).isTrue();
        assertThat(second).isFalse();
    }

    @Test
    void insertOpLedgerIfAbsent_allowsNullDeviceTransportForAccountSync() {
        String opId = "op-account-" + System.currentTimeMillis();

        boolean inserted = syncRepository.insertOpLedgerIfAbsent(opId, null, "issuer.example|acct-1", Instant.now());

        assertThat(inserted).isTrue();
    }

    @Test
    void insertOpLedgerIfAbsentScopesDedupeByOwner() {
        String opId = "op-shared-" + System.currentTimeMillis();

        boolean firstOwner = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());
        boolean secondOwner = syncRepository.insertOpLedgerIfAbsent(opId, "device-2", "guest-2", Instant.now());
        boolean firstOwnerReplay = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());

        Integer rowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM op_ledger WHERE op_id = ?",
                Integer.class,
                opId);

        assertThat(firstOwner).isTrue();
        assertThat(secondOwner).isTrue();
        assertThat(firstOwnerReplay).isFalse();
        assertThat(rowCount).isEqualTo(2);
    }

    @Test
    void migratedGuestOpLedgerRowsRemainIdempotentForAccountOwner() {
        String opId = "op-migrated-" + System.currentTimeMillis();

        boolean guestInsert = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-before-claim",
                Instant.now());
        SyncRepository.GuestToAccountMigrationCounts counts = syncRepository.migrateGuestOwnedSyncDataToAccountOwner(
                "guest-before-claim",
                "issuer.example|account-after-claim");
        boolean accountReplay = syncRepository.insertOpLedgerIfAbsent(opId, null, "issuer.example|account-after-claim",
                Instant.now());

        Integer accountRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM op_ledger WHERE guest_user_id = ? AND op_id = ?",
                Integer.class,
                "issuer.example|account-after-claim",
                opId);

        assertThat(guestInsert).isTrue();
        assertThat(counts.opLedgerRowsMoved()).isEqualTo(1);
        assertThat(accountReplay).isFalse();
        assertThat(accountRows).isEqualTo(1);
    }
}
