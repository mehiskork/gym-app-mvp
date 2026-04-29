package com.gymapp.backend.service;

import java.util.List;
import java.util.Set;

public final class SyncEntityTypes {
    public static final List<String> ORDERED_TYPES = List.of(
            "program",
            "program_week",
            "program_day",
            "exercise",
            "program_day_exercise",
            "planned_set",
            "workout_session",
            "workout_session_exercise",
            "workout_set",
            "app_meta");

    public static final Set<String> ALLOWED_TYPES = Set.copyOf(ORDERED_TYPES);

    private SyncEntityTypes() {
    }
}
