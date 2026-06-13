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

jest.mock('../../sync/syncScheduler', () => ({
  scheduleSyncSoon: jest.fn(),
}));

import { v4 as uuidv4 } from 'uuid';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import {
  ACTIVE_WORKOUT_REUSE_CONFLICT_MESSAGE,
  discardSessionIfNoMeaningfulActivity,
  startCompletedWorkoutAsQuickWorkout,
} from '../workoutSessionRepo';

type CountRow = { n: number };
type OutboxRow = { entity_type: string; entity_id: string; payload_json: string };

const benchId = 'ex_bench_press_barbell';
const rowId = 'ex_bent_over_row_barbell';
const treadmillId = 'ex_treadmill_run';

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function migrateAndSeed() {
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
}

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
}

function seedCompletedWorkout(input: {
  sessionId: string;
  title?: string;
  planned?: boolean;
  includeCardio?: boolean;
}) {
  const planId = input.planned ? 'plan-source' : null;
  const dayId = input.planned ? 'day-source' : null;

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
      rest_timer_end_at,
      rest_timer_seconds,
      rest_timer_label
    ) VALUES (?, ?, ?, ?, 'completed', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'Do not copy', '2026-01-01T11:02:00Z', 120, 'Bench');
  `,
    [input.sessionId, planId, dayId, input.title ?? 'Completed Workout'],
  );

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
      plan_note_snapshot,
      cardio_duration_minutes,
      cardio_distance_km,
      cardio_speed_kph,
      cardio_incline_percent,
      cardio_resistance_level,
      cardio_pace_seconds_per_km,
      cardio_floors,
      cardio_stair_level
    ) VALUES
      ('source-bench', ?, 'source-pde-1', ?, 'Bench Snapshot', 'strength', NULL, 1, 'Do not copy', 'Plan note', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('source-row', ?, NULL, ?, 'Row Snapshot', 'strength', NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('source-deleted-ex', ?, NULL, ?, 'Deleted Row', 'strength', NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
  `,
    [input.sessionId, benchId, input.sessionId, rowId, input.sessionId, rowId],
  );

  if (input.includeCardio) {
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
        plan_note_snapshot,
        cardio_duration_minutes,
        cardio_distance_km,
        cardio_speed_kph,
        cardio_incline_percent,
        cardio_resistance_level,
        cardio_pace_seconds_per_km,
        cardio_floors,
        cardio_stair_level
      ) VALUES ('source-cardio', ?, NULL, ?, 'Treadmill Snapshot', 'cardio', 'treadmill', 4, 'Do not copy', 'Plan note', 20, 3.5, 10.5, 2, 4, 360, 12, 7);
    `,
      [input.sessionId, treadmillId],
    );
  }

  exec(
    "UPDATE workout_session_exercise SET deleted_at = datetime('now') WHERE id = 'source-deleted-ex';",
  );

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
    ) VALUES
      ('source-set-1', 'source-bench', 1, 100, 5, 8, 90, 'Do not copy', 1, NULL),
      ('source-set-unchecked', 'source-bench', 2, 105, 4, 9, 120, NULL, 0, NULL),
      ('source-set-empty', 'source-bench', 3, 0, 0, NULL, 180, NULL, 1, NULL),
      ('source-set-null', 'source-bench', 4, NULL, NULL, NULL, 180, NULL, 1, NULL),
      ('source-set-deleted', 'source-bench', 5, 110, 3, NULL, 180, NULL, 1, datetime('now')),
      ('source-set-late', 'source-bench', 6, 120, 2, NULL, 150, NULL, 1, NULL),
      ('source-set-row', 'source-row', 1, 80, 8, 7, 60, NULL, 1, NULL),
      ('source-set-deleted-ex', 'source-deleted-ex', 1, 50, 10, NULL, 60, NULL, 1, NULL);
  `,
  );
}

function readOutboxRows(): OutboxRow[] {
  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, payload_json
    FROM outbox_op
    ORDER BY created_at, rowid;
  `,
  );
}

describe('startCompletedWorkoutAsQuickWorkout', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('creates an active ad-hoc session from a completed Quick source and leaves the source unchanged', () => {
    seedCompletedWorkout({
      sessionId: 'quick-source',
      title: 'Renamed Quick',
      includeCardio: true,
    });
    exec('DELETE FROM outbox_op;');

    const newSessionId = startCompletedWorkoutAsQuickWorkout('quick-source');

    const session = query<{
      title: string;
      status: string;
      source_workout_plan_id: string | null;
      source_program_day_id: string | null;
      workout_note: string | null;
      ended_at: string | null;
      rest_timer_end_at: string | null;
      rest_timer_seconds: number | null;
      rest_timer_label: string | null;
    }>('SELECT * FROM workout_session WHERE id = ?;', [newSessionId])[0];
    expect(session).toMatchObject({
      title: 'Renamed Quick',
      status: 'in_progress',
      source_workout_plan_id: null,
      source_program_day_id: null,
      workout_note: null,
      ended_at: null,
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    });

    expect(
      query<{ title: string; status: string; workout_note: string | null }>(
        'SELECT title, status, workout_note FROM workout_session WHERE id = ?;',
        ['quick-source'],
      )[0],
    ).toEqual({ title: 'Renamed Quick', status: 'completed', workout_note: 'Do not copy' });
  });

  it('creates an active ad-hoc session from a completed Planned source', () => {
    seedCompletedWorkout({ sessionId: 'planned-source', title: 'Push Day', planned: true });

    const newSessionId = startCompletedWorkoutAsQuickWorkout('planned-source');

    expect(
      query<{ source_workout_plan_id: string | null; source_program_day_id: string | null }>(
        'SELECT source_workout_plan_id, source_program_day_id FROM workout_session WHERE id = ?;',
        [newSessionId],
      )[0],
    ).toEqual({ source_workout_plan_id: null, source_program_day_id: null });
  });

  it('copies reusable strength sets and cardio values while resetting completion and notes', () => {
    seedCompletedWorkout({ sessionId: 'quick-source', includeCardio: true });

    const newSessionId = startCompletedWorkoutAsQuickWorkout('quick-source');

    const exercises = query<{
      id: string;
      exercise_id: string;
      exercise_name: string;
      exercise_type: string;
      position: number;
      notes: string | null;
      plan_note_snapshot: string | null;
      cardio_duration_minutes: number | null;
      cardio_distance_km: number | null;
      cardio_speed_kph: number | null;
      cardio_incline_percent: number | null;
      cardio_resistance_level: number | null;
      cardio_pace_seconds_per_km: number | null;
      cardio_floors: number | null;
      cardio_stair_level: number | null;
    }>(
      `
      SELECT *
      FROM workout_session_exercise
      WHERE workout_session_id = ?
      ORDER BY position ASC;
    `,
      [newSessionId],
    );
    expect(exercises.map((exercise) => exercise.exercise_name)).toEqual([
      'Bench Snapshot',
      'Row Snapshot',
      'Treadmill Snapshot',
    ]);
    expect(exercises.every((exercise) => exercise.notes === null)).toBe(true);
    expect(exercises.every((exercise) => exercise.plan_note_snapshot === null)).toBe(true);
    expect(exercises[2]).toMatchObject({
      cardio_duration_minutes: 20,
      cardio_distance_km: 3.5,
      cardio_speed_kph: 10.5,
      cardio_incline_percent: 2,
      cardio_resistance_level: 4,
      cardio_pace_seconds_per_km: 360,
      cardio_floors: 12,
      cardio_stair_level: 7,
    });

    const sets = query<{
      set_index: number;
      weight: number | null;
      reps: number | null;
      rpe: number | null;
      rest_seconds: number | null;
      notes: string | null;
      is_completed: number;
    }>(
      `
      SELECT ws.set_index, ws.weight, ws.reps, ws.rpe, ws.rest_seconds, ws.notes, ws.is_completed
      FROM workout_set ws
      JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
      WHERE wse.workout_session_id = ?
      ORDER BY wse.position ASC, ws.set_index ASC;
    `,
      [newSessionId],
    );
    expect(sets).toEqual([
      {
        set_index: 1,
        weight: 100,
        reps: 5,
        rpe: null,
        rest_seconds: 90,
        notes: null,
        is_completed: 0,
      },
      {
        set_index: 6,
        weight: 120,
        reps: 2,
        rpe: null,
        rest_seconds: 150,
        notes: null,
        is_completed: 0,
      },
      {
        set_index: 1,
        weight: 80,
        reps: 8,
        rpe: null,
        rest_seconds: 60,
        notes: null,
        is_completed: 0,
      },
    ]);
  });

  it('rejects active workout conflicts atomically before insert', () => {
    seedCompletedWorkout({ sessionId: 'quick-source' });
    exec(
      `
      INSERT INTO workout_session (
        id,
        source_workout_plan_id,
        source_program_day_id,
        title,
        status,
        started_at
      ) VALUES ('active-existing', NULL, NULL, 'Active', 'in_progress', '2026-01-02T10:00:00Z');
    `,
    );

    expect(() => startCompletedWorkoutAsQuickWorkout('quick-source')).toThrow(
      ACTIVE_WORKOUT_REUSE_CONFLICT_MESSAGE,
    );
    expect(count("SELECT COUNT(*) AS n FROM workout_session WHERE status = 'in_progress';")).toBe(
      1,
    );
  });

  it('enqueues outbox snapshots as session, exercises, then sets', () => {
    seedCompletedWorkout({ sessionId: 'quick-source', includeCardio: true });
    exec('DELETE FROM outbox_op;');

    const newSessionId = startCompletedWorkoutAsQuickWorkout('quick-source');
    const rows = readOutboxRows();

    expect(rows.map((row) => row.entity_type)).toEqual([
      'workout_session',
      'workout_session_exercise',
      'workout_session_exercise',
      'workout_session_exercise',
      'workout_set',
      'workout_set',
      'workout_set',
    ]);
    expect(JSON.parse(rows[0].payload_json).id).toBe(newSessionId);
  });

  it('creates a baseline snapshot so the reused active workout is not immediately auto-discarded', () => {
    seedCompletedWorkout({ sessionId: 'quick-source' });

    const newSessionId = startCompletedWorkoutAsQuickWorkout('quick-source');

    expect(discardSessionIfNoMeaningfulActivity(newSessionId)).toBe(false);
    expect(
      query<{ status: string; deleted_at: string | null }>(
        'SELECT status, deleted_at FROM workout_session WHERE id = ?;',
        [newSessionId],
      )[0],
    ).toEqual({ status: 'in_progress', deleted_at: null });
  });

  it('rejects when filtering leaves no reusable content', () => {
    exec(
      `
      INSERT INTO workout_session (
        id,
        source_workout_plan_id,
        source_program_day_id,
        title,
        status,
        started_at,
        ended_at
      ) VALUES ('empty-source', NULL, NULL, 'Empty', 'completed', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
    `,
    );
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
        notes
      ) VALUES ('empty-wse', 'empty-source', NULL, ?, 'Bench', 'strength', NULL, 1, NULL);
    `,
      [benchId],
    );
    exec(
      `
      INSERT INTO workout_set (
        id,
        workout_session_exercise_id,
        set_index,
        weight,
        reps,
        is_completed
      ) VALUES ('empty-set', 'empty-wse', 1, 0, 0, 1);
    `,
    );

    expect(() => startCompletedWorkoutAsQuickWorkout('empty-source')).toThrow(
      'No completed sets or cardio details to reuse.',
    );
    expect(count("SELECT COUNT(*) AS n FROM workout_session WHERE status = 'in_progress';")).toBe(
      0,
    );
  });
});
