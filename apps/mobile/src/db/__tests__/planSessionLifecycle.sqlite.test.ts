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

jest.mock('../../utils/restTimerNotifications', () => ({
  cancelUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
  scheduleUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
}));

import { v4 as uuidv4 } from 'uuid';
import { addExerciseToDay, deleteDay, renameDay } from '../dayExerciseRepo';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import {
  addDayToWorkoutPlan,
  createWorkoutPlan,
  getWorkoutPlanById,
  listDaysForWorkoutPlan,
  listWorkoutPlansWithSessionCounts,
} from '../workoutPlanRepo';
import { completeSession, createSessionFromPlanDay } from '../workoutSessionRepo';

type CountRow = { n: number };
type DayRow = { id: string; day_index: number; name: string | null; deleted_at: string | null };
type EntityRow = { id: string; deleted_at: string | null };
type OutboxRow = {
  entity_type: string;
  entity_id: string;
  op_type: string;
  status: string;
  payload_json: string;
};

const exerciseId = 'ex_bench_press_barbell';

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
}

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function migrateAndSeed() {
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
}

function addExerciseWithPlannedSets(dayId: string): string {
  const dayExerciseId = addExerciseToDay({ dayId, exerciseId });
  exec(
    `
    INSERT INTO planned_set (
      id,
      program_day_exercise_id,
      set_index,
      target_reps_min,
      target_reps_max,
      rest_seconds
    ) VALUES
      (?, ?, 1, 8, 8, NULL),
      (?, ?, 2, 10, 10, NULL);
  `,
    [`pset-${dayExerciseId}-1`, dayExerciseId, `pset-${dayExerciseId}-2`, dayExerciseId],
  );
  return dayExerciseId;
}

function readOutboxRows(): OutboxRow[] {
  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, op_type, status, payload_json
    FROM outbox_op
    ORDER BY created_at, id;
  `,
  );
}

describe('plan session lifecycle with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('keeps a zero-session plan queryable after all sessions are deleted', () => {
    const planId = createWorkoutPlan({ name: 'Emptyable Plan', description: 'Plan can be empty' });
    const firstDayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!firstDayId) throw new Error('Expected createWorkoutPlan to create a first session');
    addExerciseWithPlannedSets(firstDayId);

    deleteDay(firstDayId);

    expect(getWorkoutPlanById(planId)).toEqual({
      id: planId,
      name: 'Emptyable Plan',
      description: 'Plan can be empty',
      is_template: 0,
    });
    expect(listDaysForWorkoutPlan(planId)).toEqual([]);
    expect(listWorkoutPlansWithSessionCounts().find((plan) => plan.id === planId)).toMatchObject({
      id: planId,
      name: 'Emptyable Plan',
      sessionCount: 0,
    });
    expect(
      query<{ deleted_at: string | null }>('SELECT deleted_at FROM program WHERE id = ?;', [
        planId,
      ])[0]?.deleted_at,
    ).toBeNull();
  });

  it('tombstones a deleted session tree, preserves siblings and history, and enqueues sync rows', () => {
    const planId = createWorkoutPlan({ name: 'Lifecycle Plan' });
    const day1 = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!day1) throw new Error('Expected createWorkoutPlan to create Session 1');
    const day2 = addDayToWorkoutPlan(planId);
    const day3 = addDayToWorkoutPlan(planId);
    const day4 = addDayToWorkoutPlan(planId);
    renameDay(day4, 'Heavy Pull');

    addExerciseWithPlannedSets(day1);
    const deletedDayExerciseId = addExerciseWithPlannedSets(day2);
    addExerciseWithPlannedSets(day3);
    addExerciseWithPlannedSets(day4);

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId: day2 });
    completeSession(sessionId, 'completed before planner delete');
    const historyBefore = {
      sessions: count('SELECT COUNT(*) AS n FROM workout_session WHERE id = ?;', [sessionId]),
      sessionExercises: count(
        'SELECT COUNT(*) AS n FROM workout_session_exercise WHERE workout_session_id = ?;',
        [sessionId],
      ),
      sets: count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?;
      `,
        [sessionId],
      ),
    };

    exec('DELETE FROM outbox_op;');

    deleteDay(day2);

    const deletedDay = query<DayRow>(
      'SELECT id, day_index, name, deleted_at FROM program_day WHERE id = ?;',
      [day2],
    )[0];
    expect(deletedDay?.deleted_at).not.toBeNull();
    expect(deletedDay?.day_index).toBe(0);
    expect(listDaysForWorkoutPlan(planId).some((day) => day.id === day2)).toBe(false);

    const deletedDayExercises = query<EntityRow>(
      'SELECT id, deleted_at FROM program_day_exercise WHERE program_day_id = ?;',
      [day2],
    );
    expect(deletedDayExercises).toHaveLength(1);
    expect(deletedDayExercises.every((row) => row.deleted_at !== null)).toBe(true);

    const deletedPlannedSets = query<EntityRow>(
      'SELECT id, deleted_at FROM planned_set WHERE program_day_exercise_id = ? ORDER BY set_index;',
      [deletedDayExerciseId],
    );
    expect(deletedPlannedSets).toHaveLength(2);
    expect(deletedPlannedSets.every((row) => row.deleted_at !== null)).toBe(true);

    expect(listDaysForWorkoutPlan(planId)).toEqual([
      { id: day1, day_index: 1, name: 'Session 1' },
      { id: day3, day_index: 2, name: 'Session 2' },
      { id: day4, day_index: 3, name: 'Heavy Pull' },
    ]);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ? AND deleted_at IS NULL;', [day3]),
    ).toBe(1);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ? AND deleted_at IS NULL;', [day4]),
    ).toBe(1);

    const outboxRows = readOutboxRows();
    expect(outboxRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'planned_set',
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day_exercise',
          entity_id: deletedDayExerciseId,
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day2,
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day3,
          op_type: 'upsert',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day4,
          op_type: 'upsert',
          status: 'pending',
        }),
      ]),
    );
    expect(outboxRows.filter((row) => row.entity_type === 'planned_set')).toHaveLength(2);
    for (const row of outboxRows) {
      const payload = JSON.parse(row.payload_json);
      if (row.op_type === 'delete') {
        expect(payload.deleted_at).not.toBeNull();
      }
      if (row.entity_type === 'program_day' && row.entity_id === day3) {
        expect(payload.day_index).toBe(2);
        expect(payload.name).toBe('Session 2');
      }
      if (row.entity_type === 'program_day' && row.entity_id === day4) {
        expect(payload.day_index).toBe(3);
        expect(payload.name).toBe('Heavy Pull');
      }
    }

    expect({
      sessions: count('SELECT COUNT(*) AS n FROM workout_session WHERE id = ?;', [sessionId]),
      sessionExercises: count(
        'SELECT COUNT(*) AS n FROM workout_session_exercise WHERE workout_session_id = ?;',
        [sessionId],
      ),
      sets: count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?;
      `,
        [sessionId],
      ),
    }).toEqual(historyBefore);
    expect(
      query<{ status: string; deleted_at: string | null }>(
        'SELECT status, deleted_at FROM workout_session WHERE id = ?;',
        [sessionId],
      )[0],
    ).toEqual({ status: 'completed', deleted_at: null });
    expect(
      count(
        `
        SELECT COUNT(*) AS n
        FROM workout_session_exercise
        WHERE workout_session_id = ? AND deleted_at IS NOT NULL;
      `,
        [sessionId],
      ),
    ).toBe(0);
    expect(
      count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ? AND ws.deleted_at IS NOT NULL;
      `,
        [sessionId],
      ),
    ).toBe(0);
  });
});
