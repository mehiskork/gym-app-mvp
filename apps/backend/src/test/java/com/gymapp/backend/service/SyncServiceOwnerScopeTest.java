package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SyncServiceOwnerScopeTest {

        @Mock
        private SyncRepository syncRepository;

        @Test
        void guestOwnerScopeRemainsSourceOfTruthForSyncOwnership() {
                SyncService syncService = new SyncService(syncRepository);
                SyncOp op = new SyncOp(
                                "op-1",
                                "program",
                                "program-1",
                                "upsert",
                                Map.of("updated_at", "2026-03-01T00:00:00Z", "userId", "attacker-user"),
                                null);

                when(syncRepository.findEntityOwnerIdForOwner(eq("guest-principal"), eq("program"), eq("program-1")))
                                .thenReturn(Optional.empty());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(eq("op-1"), eq("device-1"), eq("guest-principal"),
                                any()))
                                .thenReturn(true);
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-1")))
                                .thenReturn(Optional.empty());
                when(syncRepository.fetchDeltasForOwner(eq("guest-principal"), eq(0L), eq(1001), any()))
                                .thenReturn(List.of());

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(op));

                assertThat(response.getAcks()).hasSize(1);
                assertThat(response.getAcks().get(0).status()).isEqualTo("applied");
                verify(syncRepository).upsertEntityStateForOwner(eq("guest-principal"), eq("program"), eq("program-1"),
                                any(),
                                any());
                verify(syncRepository).insertChangeLogForOwner(eq("guest-principal"), eq("program"), eq("program-1"),
                                eq("upsert"), any());
        }

        @Test
        void accountOwnerScopeUsesAccountNamespaceAndIgnoresPayloadUserId() {
                SyncService syncService = new SyncService(syncRepository);
                SyncOp op = new SyncOp(
                                "op-account-1",
                                "program",
                                "program-2",
                                "upsert",
                                Map.of("updated_at", "2026-03-01T00:00:00Z", "userId", "guest-escalation-attempt"),
                                null);

                when(syncRepository.findEntityOwnerIdForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2")))
                                .thenReturn(Optional.empty());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(eq("op-account-1"), eq("device-2"),
                                eq("issuer.example|acct-9"), any()))
                                .thenReturn(true);
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2")))
                                .thenReturn(Optional.empty());
                when(syncRepository.fetchDeltasForOwner(eq("issuer.example|acct-9"), eq(0L), eq(1001), any()))
                                .thenReturn(List.of());

                SyncResponse response = syncService.sync(
                                "device-2",
                                OwnerScope.account("issuer.example|acct-9"),
                                "0",
                                List.of(op));

                assertThat(response.getAcks()).hasSize(1);
                assertThat(response.getAcks().get(0).status()).isEqualTo("applied");
                verify(syncRepository).upsertEntityStateForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2"),
                                any(), any());
                verify(syncRepository).insertChangeLogForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2"), eq("upsert"), any());
        }

        @Test
        void syncRequiresRealDeviceContextForTransportLedger() {
                SyncService syncService = new SyncService(syncRepository);

                assertThatThrownBy(() -> syncService.sync(
                                null,
                                OwnerScope.account("issuer.example|acct-9"),
                                "0",
                                List.of()))
                                .isInstanceOf(ValidationException.class)
                                .hasMessageContaining("missing device id");
        }
}