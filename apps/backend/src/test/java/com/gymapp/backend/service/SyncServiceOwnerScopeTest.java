package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.gymapp.backend.controller.AccountDeletedException;
import com.gymapp.backend.controller.ValidationException;
import com.gymapp.backend.model.SyncOp;
import com.gymapp.backend.model.SyncResponse;
import com.gymapp.backend.repository.AccountDeletionRepository;
import com.gymapp.backend.repository.SyncRepository;
import com.gymapp.backend.security.OwnerScope;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SyncServiceOwnerScopeTest {

        @Mock
        private SyncRepository syncRepository;

        @Mock
        private AccountDeletionRepository accountDeletionRepository;

        @Test
        void guestOwnerScopeRemainsSourceOfTruthForSyncOwnership() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                SyncOp op = new SyncOp(
                                "op-1",
                                "program",
                                "program-1",
                                "upsert",
                                Map.of("updated_at", "2026-03-01T00:00:00Z", "userId", "attacker-user"),
                                null);

                when(syncRepository.findEntityOwnerIdForOwner(eq("guest-principal"), eq("program"), eq("program-1")))
                                .thenReturn(Optional.empty());
                when(syncRepository.findExistingOpLedgerIdsForOwner(eq("guest-principal"), eq(Set.of("op-1"))))
                                .thenReturn(Set.of());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(eq("op-1"), eq("device-1"), eq("guest-principal"),
                                any()))
                                .thenReturn(true);
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-1")))
                                .thenReturn(Optional.empty());
                when(syncRepository.findHighWaterChangeIdForOwner(eq("guest-principal")))
                                .thenReturn(1L);
                when(syncRepository.fetchEntityStateSnapshotForOwner(eq("guest-principal"), eq(null), eq(null),
                                eq(1001), any(), eq(1L)))
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
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
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
                when(accountDeletionRepository.isAccountDeleted(eq("issuer.example|acct-9")))
                                .thenReturn(false);
                when(syncRepository.findExistingOpLedgerIdsForOwner(eq("issuer.example|acct-9"),
                                eq(Set.of("op-account-1"))))
                                .thenReturn(Set.of());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(eq("op-account-1"), eq("device-2"),
                                eq("issuer.example|acct-9"), any()))
                                .thenReturn(true);
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2")))
                                .thenReturn(Optional.empty());
                when(syncRepository.findHighWaterChangeIdForOwner(eq("issuer.example|acct-9")))
                                .thenReturn(1L);
                when(syncRepository.fetchEntityStateSnapshotForOwner(eq("issuer.example|acct-9"), eq(null), eq(null),
                                eq(1001), any(), eq(1L)))
                                .thenReturn(List.of());

                SyncResponse response = syncService.sync(
                                "device-2",
                                OwnerScope.account("issuer.example|acct-9"),
                                "0",
                                List.of(op));

                assertThat(response.getAcks()).hasSize(1);
                assertThat(response.getAcks().get(0).status()).isEqualTo("applied");
                verify(accountDeletionRepository).lockAccountOwnerForTransaction("issuer.example|acct-9");
                verify(syncRepository).upsertEntityStateForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2"),
                                any(), any());
                verify(syncRepository).insertChangeLogForOwner(eq("issuer.example|acct-9"), eq("program"),
                                eq("program-2"), eq("upsert"), any());
        }

        @Test
        void accountOwnerScopeAllowsMissingDeviceTransportContext() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);

                when(accountDeletionRepository.isAccountDeleted(eq("issuer.example|acct-9")))
                                .thenReturn(false);
                when(syncRepository.findHighWaterChangeIdForOwner(eq("issuer.example|acct-9")))
                                .thenReturn(0L);
                when(syncRepository.fetchEntityStateSnapshotForOwner(eq("issuer.example|acct-9"), eq(null), eq(null),
                                eq(1001), any(), eq(0L)))
                                .thenReturn(List.of());

                SyncResponse response = syncService.sync(
                                null,
                                OwnerScope.account("issuer.example|acct-9"),
                                "0",
                                List.of());

                assertThat(response.getAcks()).isEmpty();
                assertThat(response.getDeltas()).isEmpty();
                verify(accountDeletionRepository).lockAccountOwnerForTransaction("issuer.example|acct-9");
        }

        @Test
        void sameRequestRepeatedWorkoutSetSnapshotsKeepLatestClientOrderWhenTimestampsTie() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                List<SyncOp> ops = List.of(
                                new SyncOp("op-set-create-prefill", "workout_set", "set-prefill-overwrite",
                                                "upsert",
                                                Map.of(
                                                                "id", "set-prefill-overwrite",
                                                                "workout_session_exercise_id",
                                                                "session-ex-prefill-overwrite",
                                                                "set_index", 1,
                                                                "weight", 80,
                                                                "reps", 8,
                                                                "is_completed", 0,
                                                                "updated_at", "2026-03-01T00:00:03Z"),
                                                null),
                                new SyncOp("op-set-toggle-stale", "workout_set", "set-prefill-overwrite", "upsert",
                                                Map.of(
                                                                "id", "set-prefill-overwrite",
                                                                "workout_session_exercise_id",
                                                                "session-ex-prefill-overwrite",
                                                                "set_index", 1,
                                                                "weight", 80,
                                                                "reps", 8,
                                                                "is_completed", 1,
                                                                "updated_at", "2026-03-01T00:00:03Z"),
                                                null),
                                new SyncOp("op-set-final-edit", "workout_set", "set-prefill-overwrite", "upsert",
                                                Map.of(
                                                                "id", "set-prefill-overwrite",
                                                                "workout_session_exercise_id",
                                                                "session-ex-prefill-overwrite",
                                                                "set_index", 1,
                                                                "weight", 111,
                                                                "reps", 11,
                                                                "is_completed", 1,
                                                                "updated_at", "2026-03-01T00:00:03Z"),
                                                null),
                                new SyncOp("op-session-ex-prefill", "workout_session_exercise",
                                                "session-ex-prefill-overwrite", "upsert",
                                                Map.of(
                                                                "id", "session-ex-prefill-overwrite",
                                                                "workout_session_id", "session-prefill-overwrite",
                                                                "exercise_id", "ex_bench_press_barbell",
                                                                "position", 1,
                                                                "updated_at", "2026-03-01T00:00:02Z"),
                                                null),
                                new SyncOp("op-session-complete-prefill", "workout_session",
                                                "session-prefill-overwrite", "upsert",
                                                Map.of(
                                                                "id", "session-prefill-overwrite",
                                                                "status", "completed",
                                                                "updated_at", "2026-03-01T00:00:01Z"),
                                                null));

                when(syncRepository.findExistingOpLedgerIdsForOwner(eq("guest-principal"), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findEntityPresenceForOwner(eq("guest-principal"), any()))
                                .thenReturn(Map.of());
                when(syncRepository.findForeignEntityKeys(eq("guest-principal"), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findWorkoutSessionExerciseIdsByWorkoutSetIdsForOwner(eq("guest-principal"),
                                any()))
                                .thenReturn(Map.of());
                when(syncRepository.findWorkoutSessionIdsBySessionExerciseIdsForOwner(eq("guest-principal"),
                                any()))
                                .thenReturn(Map.of());
                when(syncRepository.findCompletedWorkoutSessionIdsForOwner(eq("guest-principal"), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findEntityOwnerIdForOwner(eq("guest-principal"), any(), any()))
                                .thenReturn(Optional.empty());
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), any(), any()))
                                .thenReturn(Optional.empty());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(any(), eq("device-1"), eq("guest-principal"),
                                any()))
                                .thenReturn(true);
                when(syncRepository.findHighWaterChangeIdForOwner(eq("guest-principal")))
                                .thenReturn(1L);
                when(syncRepository.fetchEntityStateSnapshotForOwner(eq("guest-principal"), eq(null), eq(null),
                                eq(1001), any(), eq(1L)))
                                .thenReturn(List.of());

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", ops);

                assertThat(response.getAcks()).hasSize(5);
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository, times(3)).upsertEntityStateForOwner(eq("guest-principal"), eq("workout_set"),
                                eq("set-prefill-overwrite"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getAllValues().get(2))
                                .containsEntry("weight", 111)
                                .containsEntry("reps", 11)
                                .containsEntry("is_completed", 1);
        }

        @Test
        void sameRequestUpsertThenDeleteWithEqualTimestampTombstonesLatestOp() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-delete-tie")))
                                .thenReturn(Optional.empty());

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-upsert-delete-tie", "program", "program-delete-tie", "upsert",
                                                Map.of(
                                                                "id", "program-delete-tie",
                                                                "name", "Edited",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null),
                                new SyncOp("op-delete-tie", "program", "program-delete-tie", "delete",
                                                Map.of(
                                                                "id", "program-delete-tie",
                                                                "deleted_at", "2026-03-01T00:00:00Z",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository, times(2)).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-delete-tie"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getAllValues().get(1))
                                .containsEntry("name", "Edited")
                                .containsEntry("deleted_at", "2026-03-01T00:00:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:00:00Z");
        }

        @Test
        void sameRequestDeleteThenUpsertWithEqualTimestampLeavesLatestUpsertActive() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-upsert-tie")))
                                .thenReturn(Optional.empty());

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-delete-upsert-tie", "program", "program-upsert-tie", "delete",
                                                Map.of(
                                                                "id", "program-upsert-tie",
                                                                "deleted_at", "2026-03-01T00:00:00Z",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null),
                                new SyncOp("op-upsert-tie", "program", "program-upsert-tie", "upsert",
                                                Map.of(
                                                                "id", "program-upsert-tie",
                                                                "name", "Restored in same request",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository, times(2)).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-upsert-tie"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getAllValues().get(1))
                                .containsEntry("name", "Restored in same request")
                                .doesNotContainKey("deleted_at");
        }

        @Test
        void preExistingTombstoneDeleteThenUpsertWithEqualTimestampRemainsTombstoned() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                stubPreExistingTombstone("program-pre-tombstone-delete-upsert", "2026-03-01T00:00:00Z");

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-pre-tombstone-delete-first", "program",
                                                "program-pre-tombstone-delete-upsert", "delete",
                                                Map.of(
                                                                "id", "program-pre-tombstone-delete-upsert",
                                                                "deleted_at", "2026-03-01T00:01:00Z",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null),
                                new SyncOp("op-pre-tombstone-upsert-last", "program",
                                                "program-pre-tombstone-delete-upsert", "upsert",
                                                Map.of(
                                                                "id", "program-pre-tombstone-delete-upsert",
                                                                "name", "Must not resurrect",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "noop");
                assertThat(response.getAcks()).extracting(ack -> ack.reason())
                                .containsExactly(null, "delete wins (no resurrection)");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-pre-tombstone-delete-upsert"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getValue())
                                .containsEntry("name", "Already deleted")
                                .containsEntry("deleted_at", "2026-03-01T00:01:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:01:00Z");
        }

        @Test
        void preExistingTombstoneUpsertThenUpdateWithEqualTimestampRemainsTombstoned() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                stubPreExistingTombstone("program-pre-tombstone-upsert-update", "2026-03-01T00:00:00Z");

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-pre-tombstone-upsert-first", "program",
                                                "program-pre-tombstone-upsert-update", "upsert",
                                                Map.of(
                                                                "id", "program-pre-tombstone-upsert-update",
                                                                "name", "Created",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null),
                                new SyncOp("op-pre-tombstone-update-last", "program",
                                                "program-pre-tombstone-upsert-update", "upsert",
                                                Map.of(
                                                                "id", "program-pre-tombstone-upsert-update",
                                                                "name", "Updated",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("noop", "noop");
                assertThat(response.getAcks()).extracting(ack -> ack.reason())
                                .containsExactly("delete wins (no resurrection)", "delete wins (no resurrection)");
                verify(syncRepository, never()).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-pre-tombstone-upsert-update"), any(), any());
        }

        @Test
        void preExistingTombstoneUpsertThenDeleteWithEqualTimestampRemainsTombstoned() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                stubPreExistingTombstone("program-pre-tombstone-upsert-delete", "2026-03-01T00:00:00Z");

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-pre-tombstone-upsert-before-delete", "program",
                                                "program-pre-tombstone-upsert-delete", "upsert",
                                                Map.of(
                                                                "id", "program-pre-tombstone-upsert-delete",
                                                                "name", "Must not write",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null),
                                new SyncOp("op-pre-tombstone-delete-last", "program",
                                                "program-pre-tombstone-upsert-delete", "delete",
                                                Map.of(
                                                                "id", "program-pre-tombstone-upsert-delete",
                                                                "deleted_at", "2026-03-01T00:01:00Z",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("noop", "applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-pre-tombstone-upsert-delete"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getValue())
                                .containsEntry("name", "Already deleted")
                                .containsEntry("deleted_at", "2026-03-01T00:01:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:01:00Z");
        }

        @Test
        void preExistingTombstoneDeleteThenUpdateWithEqualTimestampRemainsTombstoned() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                stubPreExistingTombstone("program-pre-tombstone-delete-update", "2026-03-01T00:00:00Z");

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-pre-tombstone-delete-before-update", "program",
                                                "program-pre-tombstone-delete-update", "delete",
                                                Map.of(
                                                                "id", "program-pre-tombstone-delete-update",
                                                                "deleted_at", "2026-03-01T00:01:00Z",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null),
                                new SyncOp("op-pre-tombstone-update-last", "program",
                                                "program-pre-tombstone-delete-update", "upsert",
                                                Map.of(
                                                                "id", "program-pre-tombstone-delete-update",
                                                                "name", "Must not resurrect",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "noop");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-pre-tombstone-delete-update"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getValue())
                                .containsEntry("name", "Already deleted")
                                .containsEntry("deleted_at", "2026-03-01T00:01:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:01:00Z");
        }

        @Test
        void sameRequestUpsertThenUpdateThenDeleteWithEqualTimestampTombstonesLatestUpdate() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-update-delete-tie")))
                                .thenReturn(Optional.empty());

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-update-delete-create", "program", "program-update-delete-tie",
                                                "upsert",
                                                Map.of(
                                                                "id", "program-update-delete-tie",
                                                                "name", "Created",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null),
                                new SyncOp("op-update-delete-update", "program", "program-update-delete-tie",
                                                "upsert",
                                                Map.of(
                                                                "id", "program-update-delete-tie",
                                                                "name", "Updated",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null),
                                new SyncOp("op-update-delete-delete", "program", "program-update-delete-tie",
                                                "delete",
                                                Map.of(
                                                                "id", "program-update-delete-tie",
                                                                "deleted_at", "2026-03-01T00:00:00Z",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "applied", "applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository, times(3)).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-update-delete-tie"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getAllValues().get(2))
                                .containsEntry("name", "Updated")
                                .containsEntry("deleted_at", "2026-03-01T00:00:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:00:00Z");
        }

        @Test
        void activeEqualTimestampDeleteThenUpsertCanEndActiveForLatestSameRequestOp() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-active-delete-upsert")))
                                .thenReturn(Optional.of(new SyncRepository.EntityStateRecord(
                                                Map.of(
                                                                "id", "program-active-delete-upsert",
                                                                "name", "Active before request",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                Instant.parse("2026-03-01T00:00:01Z"))));

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-active-delete-first", "program", "program-active-delete-upsert",
                                                "delete",
                                                Map.of(
                                                                "id", "program-active-delete-upsert",
                                                                "deleted_at", "2026-03-01T00:00:00Z",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null),
                                new SyncOp("op-active-upsert-last", "program", "program-active-delete-upsert",
                                                "upsert",
                                                Map.of(
                                                                "id", "program-active-delete-upsert",
                                                                "name", "Active after request",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status())
                                .containsExactly("applied", "applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository, times(2)).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-active-delete-upsert"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getAllValues().get(1))
                                .containsEntry("name", "Active after request")
                                .doesNotContainKey("deleted_at");
        }

        @Test
        void staleOlderUpsertCannotResurrectNewerTombstone() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-stale-upsert-tombstone")))
                                .thenReturn(Optional.of(new SyncRepository.EntityStateRecord(
                                                Map.of(
                                                                "id", "program-stale-upsert-tombstone",
                                                                "name", "Already deleted",
                                                                "deleted_at", "2026-03-01T00:01:00Z",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                Instant.parse("2026-03-01T00:01:01Z"))));

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-stale-upsert-tombstone", "program",
                                                "program-stale-upsert-tombstone", "upsert",
                                                Map.of(
                                                                "id", "program-stale-upsert-tombstone",
                                                                "name", "Must not resurrect",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status()).containsExactly("noop");
                assertThat(response.getAcks()).extracting(ack -> ack.reason())
                                .containsExactly("delete wins (no resurrection)");
                verify(syncRepository, never()).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-stale-upsert-tombstone"), any(), any());
        }

        @Test
        void staleDeleteWithOlderTimestampCannotTombstoneNewerActiveEntity() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-stale-delete")))
                                .thenReturn(Optional.of(new SyncRepository.EntityStateRecord(
                                                Map.of(
                                                                "id", "program-stale-delete",
                                                                "name", "Newer active",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                Instant.parse("2026-03-01T00:01:01Z"))));

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-stale-delete", "program", "program-stale-delete", "delete",
                                                Map.of(
                                                                "id", "program-stale-delete",
                                                                "deleted_at", "2026-03-01T00:00:00Z",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status()).containsExactly("noop");
                assertThat(response.getAcks()).extracting(ack -> ack.reason()).containsExactly("stale delete");
                verify(syncRepository, never()).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-stale-delete"), any(), any());
        }

        @Test
        void deleteWithNewerTimestampTombstonesActiveEntity() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                stubSyncRequest("guest-principal", "device-1");
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq("program-newer-delete")))
                                .thenReturn(Optional.of(new SyncRepository.EntityStateRecord(
                                                Map.of(
                                                                "id", "program-newer-delete",
                                                                "name", "Older active",
                                                                "updated_at", "2026-03-01T00:00:00Z"),
                                                Instant.parse("2026-03-01T00:00:01Z"))));

                SyncResponse response = syncService.sync("device-1", "guest-principal", "0", List.of(
                                new SyncOp("op-newer-delete", "program", "program-newer-delete", "delete",
                                                Map.of(
                                                                "id", "program-newer-delete",
                                                                "deleted_at", "2026-03-01T00:01:00Z",
                                                                "updated_at", "2026-03-01T00:01:00Z"),
                                                null)));

                assertThat(response.getAcks()).extracting(ack -> ack.status()).containsExactly("applied");
                ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
                verify(syncRepository).upsertEntityStateForOwner(eq("guest-principal"), eq("program"),
                                eq("program-newer-delete"), payloadCaptor.capture(), any());
                assertThat(payloadCaptor.getValue())
                                .containsEntry("name", "Older active")
                                .containsEntry("deleted_at", "2026-03-01T00:01:00Z")
                                .containsEntry("updated_at", "2026-03-01T00:01:00Z");
        }

        @Test
        void accountOwnerScopeLocksAndRejectsTombstonedAccountBeforeProcessingOps() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                SyncOp op = new SyncOp(
                                "op-account-deleted",
                                "program",
                                "program-deleted",
                                "upsert",
                                Map.of("updated_at", "2026-03-01T00:00:00Z"),
                                null);
                when(accountDeletionRepository.isAccountDeleted(eq("issuer.example|deleted")))
                                .thenReturn(true);

                assertThatThrownBy(() -> syncService.sync(
                                null,
                                OwnerScope.account("issuer.example|deleted"),
                                "0",
                                List.of(op)))
                                .isInstanceOf(AccountDeletedException.class);

                verify(accountDeletionRepository).lockAccountOwnerForTransaction("issuer.example|deleted");
                verifyNoInteractions(syncRepository);
        }

        @Test
        void mismatchedPayloadIdIsRejectedBeforeLedgerOrStateWrites() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);
                SyncOp op = new SyncOp(
                                "op-mismatched-id",
                                "program",
                                "program-a",
                                "upsert",
                                Map.of(
                                                "id", "program-b",
                                                "updated_at", "2026-03-01T00:00:00Z"),
                                null);

                assertThatThrownBy(() -> syncService.sync(
                                "device-1",
                                "guest-principal",
                                "0",
                                List.of(op)))
                                .isInstanceOf(ValidationException.class)
                                .hasMessageContaining("Invalid sync operation");

                verifyNoInteractions(syncRepository);
        }

        @Test
        void guestOwnerScopeStillRequiresDeviceTransportContext() {
                SyncService syncService = new SyncService(syncRepository, accountDeletionRepository);

                assertThatThrownBy(() -> syncService.sync(
                                null,
                                OwnerScope.guest("guest-9"),
                                "0",
                                List.of()))
                                .isInstanceOf(ValidationException.class)
                                .hasMessageContaining("missing device id");
        }

        private void stubSyncRequest(String ownerId, String deviceId) {
                when(syncRepository.findExistingOpLedgerIdsForOwner(eq(ownerId), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findEntityPresenceForOwner(eq(ownerId), any()))
                                .thenReturn(Map.of());
                when(syncRepository.findForeignEntityKeys(eq(ownerId), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findWorkoutSessionExerciseIdsByWorkoutSetIdsForOwner(eq(ownerId), any()))
                                .thenReturn(Map.of());
                when(syncRepository.findWorkoutSessionIdsBySessionExerciseIdsForOwner(eq(ownerId), any()))
                                .thenReturn(Map.of());
                when(syncRepository.findCompletedWorkoutSessionIdsForOwner(eq(ownerId), any()))
                                .thenReturn(Set.of());
                when(syncRepository.findEntityOwnerIdForOwner(eq(ownerId), any(), any()))
                                .thenReturn(Optional.empty());
                when(syncRepository.insertOpLedgerIfAbsentForOwner(any(), eq(deviceId), eq(ownerId), any()))
                                .thenReturn(true);
                when(syncRepository.findHighWaterChangeIdForOwner(eq(ownerId)))
                                .thenReturn(1L);
                when(syncRepository.fetchEntityStateSnapshotForOwner(eq(ownerId), eq(null), eq(null),
                                eq(1001), any(), eq(1L)))
                                .thenReturn(List.of());
        }

        private void stubPreExistingTombstone(String entityId, String timestamp) {
                when(syncRepository.findEntityStateWithReceivedAtForOwner(eq("guest-principal"), eq("program"),
                                eq(entityId)))
                                .thenReturn(Optional.of(new SyncRepository.EntityStateRecord(
                                                Map.of(
                                                                "id", entityId,
                                                                "name", "Already deleted",
                                                                "deleted_at", timestamp,
                                                                "updated_at", timestamp),
                                                Instant.parse(timestamp))));
        }
}
