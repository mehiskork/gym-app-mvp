package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.gymapp.backend.security.OwnerScope;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

class SyncServiceTransactionTest {

    @Test
    void guestSyncUsesRepeatableReadTransaction() throws Exception {
        assertRepeatableReadTransaction(String.class, String.class, String.class, List.class);
    }

    @Test
    void ownerScopedSyncUsesRepeatableReadTransaction() throws Exception {
        assertRepeatableReadTransaction(String.class, OwnerScope.class, String.class, List.class);
    }

    private void assertRepeatableReadTransaction(Class<?>... parameterTypes) throws Exception {
        Transactional transactional = SyncService.class
                .getMethod("sync", parameterTypes)
                .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.isolation()).isEqualTo(Isolation.REPEATABLE_READ);
    }
}
