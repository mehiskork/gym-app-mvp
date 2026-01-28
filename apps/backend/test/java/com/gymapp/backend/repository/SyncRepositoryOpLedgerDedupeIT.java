package com.gymapp.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class SyncRepositoryOpLedgerDedupeIT {

    @Autowired
    private SyncRepository syncRepository;

    @Test
    void insertOpLedgerIfAbsent_isIdempotent() {
        String opId = "op-" + System.currentTimeMillis();

        boolean first = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());
        boolean second = syncRepository.insertOpLedgerIfAbsent(opId, "device-1", "guest-1", Instant.now());

        assertThat(first).isTrue();
        assertThat(second).isFalse();
    }
}
