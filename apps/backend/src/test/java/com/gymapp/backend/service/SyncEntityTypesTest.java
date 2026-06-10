package com.gymapp.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SyncEntityTypesTest {

    private static final List<String> EXPECTED_SYNCED_ENTITY_ORDER = List.of(
            "program",
            "program_week",
            "program_day",
            "exercise",
            "exercise_favorite",
            "program_day_exercise",
            "planned_set",
            "workout_session",
            "workout_session_exercise",
            "workout_set");

    // Intentionally duplicated here to catch accidental backend/mobile/docs drift.
    private static final Set<String> LOCAL_DERIVED_ENTITIES = Set.of("pr_event");

    private static final Set<String> MOBILE_LOCAL_METADATA_ENTITIES = Set.of("app_meta");

    private static final Set<String> BACKEND_ONLY_INFRA_ENTITIES = Set.of(
            "device",
            "device_token",
            "claim",
            "identity_link",
            "guest_account_migration_audit",
            "op_ledger",
            "change_log",
            "entity_state");

    @Test
    void orderedTypesMatchCurrentSyncEntityPolicy() {
        assertThat(SyncEntityTypes.ORDERED_TYPES).containsExactlyElementsOf(EXPECTED_SYNCED_ENTITY_ORDER);
    }

    @Test
    void allowedTypesMatchOrderedTypesAndExcludeLocalDerivedAndBackendInfra() {
        assertThat(SyncEntityTypes.ALLOWED_TYPES).containsExactlyInAnyOrderElementsOf(EXPECTED_SYNCED_ENTITY_ORDER);
        assertThat(SyncEntityTypes.ALLOWED_TYPES).doesNotContainAnyElementsOf(LOCAL_DERIVED_ENTITIES);
        assertThat(SyncEntityTypes.ALLOWED_TYPES).doesNotContainAnyElementsOf(MOBILE_LOCAL_METADATA_ENTITIES);
        assertThat(SyncEntityTypes.ALLOWED_TYPES).doesNotContainAnyElementsOf(BACKEND_ONLY_INFRA_ENTITIES);
    }
}
