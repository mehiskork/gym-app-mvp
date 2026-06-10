jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

  return {
    openDatabaseSync: jest.fn(() => {
      const database = new DatabaseSync(':memory:');

      return {
        execSync: (sql: string) => {
          database.exec(sql);
        },
        prepareSync: (sql: string) => {
          const statement = database.prepare(sql);

          return {
            executeSync: (params: unknown[] = []) => {
              const normalized = sql.trim().toUpperCase();
              const bindParams = (Array.isArray(params) ? params : [params]) as Parameters<
                typeof statement.all
              >;

              if (
                normalized.startsWith('SELECT') ||
                normalized.startsWith('PRAGMA') ||
                normalized.startsWith('WITH')
              ) {
                return statement.all(...bindParams);
              }

              statement.run(...(bindParams as Parameters<typeof statement.run>));
              return [];
            },
            finalizeSync: jest.fn(),
          };
        },
      };
    }),
  };
});

import { exec, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { listWorkoutHistoryExportRows } from '../workoutHistoryExportRepo';

function seedSession(input: {
  id: string;
  title: string;
  status: 'in_progress' | 'completed' | 'discarded';
  startedAt: string;
  endedAt?: string | null;
  workoutNote?: string | null;
  sourcePlanId?: string | null;
  sourceDayId?: string | null;
  deletedAt?: string | null;
}) {
  exec(
    `
    INSERT INTO workout_session (
      id,
      source_workout_plan_id,
      source_program_day_id,
      title,
      status,
      started_at,
      ended_at,
      workout_note,
      deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      input.id,
      input.sourcePlanId ?? null,
      input.sourceDayId ?? null,
      input.title,
      input.status,
      input.startedAt,
      input.endedAt ?? null,
      input.workoutNote ?? null,
      input.deletedAt ?? null,
    ],
  );
}

function seedExercise(input: {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseType: 'strength' | 'cardio';
  position: number;
  notes?: string | null;
  deletedAt?: string | null;
  cardio?: {
    duration?: number | null;
    distance?: number | null;
    speed?: number | null;
    incline?: number | null;
    resistance?: number | null;
    pace?: number | null;
    floors?: number | null;
    stairLevel?: number | null;
  };
}) {
  exec(
    `
    INSERT INTO workout_session_exercise (
      id,
      workout_session_id,
      source_program_day_exercise_id,
      exercise_id,
      exercise_name,
      exercise_type,
      cardio_profile,
      position,
      notes,
      cardio_duration_minutes,
      cardio_distance_km,
      cardio_speed_kph,
      cardio_incline_percent,
      cardio_resistance_level,
      cardio_pace_seconds_per_km,
      cardio_floors,
      cardio_stair_level,
      deleted_at
    ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      input.id,
      input.sessionId,
      input.exerciseId,
      input.exerciseName,
      input.exerciseType,
      input.position,
      input.notes ?? null,
      input.cardio?.duration ?? null,
      input.cardio?.distance ?? null,
      input.cardio?.speed ?? null,
      input.cardio?.incline ?? null,
      input.cardio?.resistance ?? null,
      input.cardio?.pace ?? null,
      input.cardio?.floors ?? null,
      input.cardio?.stairLevel ?? null,
      input.deletedAt ?? null,
    ],
  );
}

function seedSet(input: {
  id: string;
  exerciseId: string;
  setIndex: number;
  weight?: number | null;
  reps?: number | null;
  isCompleted: 0 | 1;
  deletedAt?: string | null;
}) {
  exec(
    `
    INSERT INTO workout_set (
      id,
      workout_session_exercise_id,
      set_index,
      weight,
      reps,
      rpe,
      rest_seconds,
      notes,
      is_completed,
      deleted_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?);
  `,
    [
      input.id,
      input.exerciseId,
      input.setIndex,
      input.weight ?? null,
      input.reps ?? null,
      input.isCompleted,
      input.deletedAt ?? null,
    ],
  );
}

describe('workoutHistoryExportRepo', () => {
  beforeEach(() => {
    resetLocalDatabase();
    runMigrations();
  });

  it('exports performed strength sets and cardio summaries from completed non-deleted sessions only', () => {
    seedSession({
      id: 'completed-quick',
      title: 'Quick Strength',
      status: 'completed',
      startedAt: '2026-01-01T09:00:00.000Z',
      endedAt: '2026-01-01T10:00:00.000Z',
      workoutNote: 'Good, hard session',
    });
    seedExercise({
      id: 'wse-strength',
      sessionId: 'completed-quick',
      exerciseId: 'ex-bench',
      exerciseName: 'Bench Press Snapshot',
      exerciseType: 'strength',
      position: 2,
      notes: 'Paused reps',
    });
    seedSet({
      id: 'set-completed',
      exerciseId: 'wse-strength',
      setIndex: 1,
      weight: 80,
      reps: 5,
      isCompleted: 1,
    });
    seedSet({
      id: 'set-incomplete',
      exerciseId: 'wse-strength',
      setIndex: 2,
      weight: 82.5,
      reps: 5,
      isCompleted: 0,
    });
    seedSet({
      id: 'set-deleted',
      exerciseId: 'wse-strength',
      setIndex: 3,
      weight: 85,
      reps: 3,
      isCompleted: 1,
      deletedAt: '2026-01-01T11:00:00.000Z',
    });

    seedSession({
      id: 'completed-planned',
      title: 'Planned Cardio',
      status: 'completed',
      startedAt: '2026-01-02T09:00:00.000Z',
      endedAt: '2026-01-02T09:45:00.000Z',
      sourcePlanId: 'plan-1',
    });
    seedExercise({
      id: 'wse-cardio',
      sessionId: 'completed-planned',
      exerciseId: 'ex-treadmill',
      exerciseName: 'Treadmill Snapshot',
      exerciseType: 'cardio',
      position: 1,
      notes: 'Zone 2',
      cardio: {
        duration: 30,
        distance: 5,
        speed: 10,
        incline: 2,
        resistance: 4,
        pace: 360,
        floors: 20,
        stairLevel: 7,
      },
    });
    seedExercise({
      id: 'wse-empty-cardio',
      sessionId: 'completed-planned',
      exerciseId: 'ex-bike',
      exerciseName: 'Bike Snapshot',
      exerciseType: 'cardio',
      position: 2,
    });

    seedSession({
      id: 'active',
      title: 'Active',
      status: 'in_progress',
      startedAt: '2026-01-03T09:00:00.000Z',
    });
    seedExercise({
      id: 'wse-active',
      sessionId: 'active',
      exerciseId: 'ex-active',
      exerciseName: 'Active Lift',
      exerciseType: 'strength',
      position: 1,
    });
    seedSet({
      id: 'set-active',
      exerciseId: 'wse-active',
      setIndex: 1,
      weight: 100,
      reps: 1,
      isCompleted: 1,
    });

    seedSession({
      id: 'discarded',
      title: 'Discarded',
      status: 'discarded',
      startedAt: '2026-01-04T09:00:00.000Z',
    });
    seedExercise({
      id: 'wse-discarded',
      sessionId: 'discarded',
      exerciseId: 'ex-discarded',
      exerciseName: 'Discarded Lift',
      exerciseType: 'strength',
      position: 1,
    });
    seedSet({
      id: 'set-discarded',
      exerciseId: 'wse-discarded',
      setIndex: 1,
      weight: 100,
      reps: 1,
      isCompleted: 1,
    });

    seedSession({
      id: 'deleted-session',
      title: 'Deleted',
      status: 'completed',
      startedAt: '2026-01-05T09:00:00.000Z',
      deletedAt: '2026-01-05T10:00:00.000Z',
    });
    seedExercise({
      id: 'wse-deleted-session',
      sessionId: 'deleted-session',
      exerciseId: 'ex-deleted',
      exerciseName: 'Deleted Lift',
      exerciseType: 'strength',
      position: 1,
    });
    seedSet({
      id: 'set-deleted-session',
      exerciseId: 'wse-deleted-session',
      setIndex: 1,
      weight: 100,
      reps: 1,
      isCompleted: 1,
    });

    const rows = listWorkoutHistoryExportRows();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workout_date: '2026-01-01',
      workout_started_at: '2026-01-01T09:00:00.000Z',
      workout_ended_at: '2026-01-01T10:00:00.000Z',
      workout_name: 'Quick Strength',
      workout_source: 'quick_workout',
      exercise_name: 'Bench Press Snapshot',
      exercise_id: 'ex-bench',
      exercise_type: 'strength',
      exercise_order: 2,
      set_index: 1,
      is_completed: 1,
      reps: 5,
      weight: 80,
      duration_minutes: null,
      workout_note: 'Good, hard session',
      exercise_note: 'Paused reps',
    });
    expect(rows[1]).toMatchObject({
      workout_date: '2026-01-02',
      workout_source: 'planned_workout',
      exercise_name: 'Treadmill Snapshot',
      exercise_id: 'ex-treadmill',
      exercise_type: 'cardio',
      exercise_order: 1,
      set_index: null,
      is_completed: null,
      reps: null,
      weight: null,
      duration_minutes: 30,
      distance_km: 5,
      speed_kph: 10,
      incline_percent: 2,
      resistance_level: 4,
      pace_seconds_per_km: 360,
      floors: 20,
      stair_level: 7,
      exercise_note: 'Zone 2',
    });
  });

  it('returns no rows when there is no exportable completed work', () => {
    seedSession({
      id: 'empty-completed',
      title: 'Empty',
      status: 'completed',
      startedAt: '2026-01-01T09:00:00.000Z',
      endedAt: '2026-01-01T09:15:00.000Z',
    });
    seedExercise({
      id: 'wse-empty',
      sessionId: 'empty-completed',
      exerciseId: 'ex-empty',
      exerciseName: 'Empty Lift',
      exerciseType: 'strength',
      position: 1,
    });
    seedSet({
      id: 'set-empty',
      exerciseId: 'wse-empty',
      setIndex: 1,
      weight: 40,
      reps: 8,
      isCompleted: 0,
    });

    expect(listWorkoutHistoryExportRows()).toEqual([]);
  });
});
