package com.gymapp.backend.service;

import java.util.Set;

public final class SyncEntityTypes {
    public static final Set<String> ALLOWED_TYPES = Set.of(
            "program",
            "program_week",
            "program_day",
            "exercise",
            "program_day_exercise",
            "planned_set",
            "workout_session",
            "workout_session_exercise",
            "workout_set",
            "pr_event",
            "app_meta");

    private SyncEntityTypes() {
    }
}