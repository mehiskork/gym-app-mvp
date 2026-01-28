package com.gymapp.backend.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class SyncRepositoryTimestampBindingIT {

    @Autowired
    SyncRepository syncRepository;

    @Test
    void insertOpLedger_bindsInstantAsTimestamp() {
        String opId = "op-" + System.currentTimeMillis();
        assertThatNoException()
                .isThrownBy(() -> syncRepository.insertOpLedger(opId, "device-1", "guest-1", Instant.now()));
        assertThat(syncRepository.opExists(opId)).isTrue();
    }
}
