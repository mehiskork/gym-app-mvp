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

jest.mock('../../db/outboxRepo', () => ({
  hasActiveOutboxOpForEntity: jest.fn(() => false),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

import { applyDeltas, type SyncDelta } from '../applyDeltas';
import { exec, query, resetLocalDatabase } from '../../db/db';
import { runMigrations } from '../../db/migrate';
import { inTransaction } from '../../db/tx';

type OrderedRow = {
  id: string;
  order_value: number;
  deleted_at: string | null;
};

function migrate() {
  resetLocalDatabase();
  runMigrations();
}

function rows(tableName: string, orderField: string): OrderedRow[] {
  return query<OrderedRow>(
    `
    SELECT id, ${orderField} AS order_value, deleted_at
    FROM ${tableName}
    ORDER BY ${orderField} ASC;
  `,
  );
}

function insertProgramWithWeeks(weeks: Array<{ id: string; weekIndex: number }>) {
  exec(`
    INSERT INTO program (id, name, created_at, updated_at, version)
    VALUES ('program-1', 'Plan', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
  `);

  for (const week of weeks) {
    exec(
      `
      INSERT INTO program_week (id, program_id, week_index, created_at, updated_at, version)
      VALUES (?, 'program-1', ?, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `,
      [week.id, week.weekIndex],
    );
  }
}

function programWeekDelta(id: string, weekIndex: number): SyncDelta {
  return {
    entityType: 'program_week',
    entityId: id,
    opType: 'upsert',
    payload: {
      id,
      program_id: 'program-1',
      week_index: weekIndex,
      created_at: '2026-05-24T10:00:00.000Z',
      updated_at: '2026-05-24T12:00:00.000Z',
      version: 2,
    },
  };
}

function swapDeltas(input: {
  entityType: string;
  parentField: string;
  parentId: string;
  orderField: string;
  firstId: string;
  secondId: string;
  extraPayload?: Record<string, unknown>;
}): SyncDelta[] {
  const base = {
    [input.parentField]: input.parentId,
    created_at: '2026-05-24T10:00:00.000Z',
    updated_at: '2026-05-24T12:00:00.000Z',
    version: 2,
  };
  return [
    {
      entityType: input.entityType,
      entityId: input.firstId,
      opType: 'upsert',
      payload: {
        ...base,
        ...input.extraPayload,
        id: input.firstId,
        [input.orderField]: 1,
      },
    },
    {
      entityType: input.entityType,
      entityId: input.secondId,
      opType: 'upsert',
      payload: {
        ...base,
        ...input.extraPayload,
        id: input.secondId,
        [input.orderField]: 0,
      },
    },
  ];
}

describe('applyDeltas ordered sibling staging with SQLite', () => {
  beforeEach(() => {
    migrate();
    exec(
      `
      INSERT INTO exercise (
        id, name, normalized_name, is_custom, exercise_type, created_at, updated_at, version
      )
      VALUES
        ('exercise-1', 'Bench Press', 'bench press', 0, 'strength', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1),
        ('exercise-2', 'Squat', 'squat', 0, 'strength', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `,
    );
  });

  it('applies a program_week week_index swap without a UNIQUE collision', () => {
    insertProgramWithWeeks([
      { id: 'week-1', weekIndex: 0 },
      { id: 'week-2', weekIndex: 1 },
    ]);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'program_week',
          parentField: 'program_id',
          parentId: 'program-1',
          orderField: 'week_index',
          firstId: 'week-1',
          secondId: 'week-2',
        }),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('program_week', 'week_index')).toEqual([
      { id: 'week-2', order_value: 0, deleted_at: null },
      { id: 'week-1', order_value: 1, deleted_at: null },
    ]);
  });

  it.failing('does not throw when a two-row ordered swap arrives split across delta pages', () => {
    insertProgramWithWeeks([
      { id: 'week-1', weekIndex: 0 },
      { id: 'week-2', weekIndex: 1 },
    ]);

    expect(() => applyDeltas([programWeekDelta('week-1', 1)])).not.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it.failing(
    'does not throw when a partial three-row ordered reorder omits the target occupant delta',
    () => {
      insertProgramWithWeeks([
        { id: 'week-a', weekIndex: 0 },
        { id: 'week-b', weekIndex: 1 },
        { id: 'week-c', weekIndex: 2 },
      ]);

      expect(() =>
        applyDeltas([programWeekDelta('week-a', 1), programWeekDelta('week-c', 0)]),
      ).not.toThrow(/UNIQUE constraint failed/);
    },
  );

  it('rolls back staged ordered rows when a partial reorder fails inside a transaction', () => {
    insertProgramWithWeeks([
      { id: 'week-a', weekIndex: 0 },
      { id: 'week-b', weekIndex: 1 },
      { id: 'week-c', weekIndex: 2 },
    ]);

    expect(() =>
      inTransaction(() => {
        applyDeltas([programWeekDelta('week-a', 1), programWeekDelta('week-c', 0)]);
      }),
    ).toThrow(/UNIQUE constraint failed/);
    expect(rows('program_week', 'week_index')).toEqual([
      { id: 'week-a', order_value: 0, deleted_at: null },
      { id: 'week-b', order_value: 1, deleted_at: null },
      { id: 'week-c', order_value: 2, deleted_at: null },
    ]);
  });

  it('applies a program_day day_index swap without a UNIQUE collision', () => {
    exec(`
      INSERT INTO program (id, name, created_at, updated_at, version)
      VALUES ('program-1', 'Plan', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_week (id, program_id, week_index, created_at, updated_at, version)
      VALUES ('week-1', 'program-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_day (id, program_week_id, day_index, name, created_at, updated_at, version)
      VALUES
        ('day-1', 'week-1', 0, 'A', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1),
        ('day-2', 'week-1', 1, 'B', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'program_day',
          parentField: 'program_week_id',
          parentId: 'week-1',
          orderField: 'day_index',
          firstId: 'day-1',
          secondId: 'day-2',
          extraPayload: { name: 'Synced' },
        }),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('program_day', 'day_index')).toEqual([
      { id: 'day-2', order_value: 0, deleted_at: null },
      { id: 'day-1', order_value: 1, deleted_at: null },
    ]);
  });

  it('applies a program_day_exercise position swap without a UNIQUE collision', () => {
    exec(`
      INSERT INTO program (id, name, created_at, updated_at, version)
      VALUES ('program-1', 'Plan', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_week (id, program_id, week_index, created_at, updated_at, version)
      VALUES ('week-1', 'program-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_day (id, program_week_id, day_index, created_at, updated_at, version)
      VALUES ('day-1', 'week-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, created_at, updated_at, version)
      VALUES
        ('day-ex-1', 'day-1', 'exercise-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1),
        ('day-ex-2', 'day-1', 'exercise-2', 1, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'program_day_exercise',
          parentField: 'program_day_id',
          parentId: 'day-1',
          orderField: 'position',
          firstId: 'day-ex-1',
          secondId: 'day-ex-2',
          extraPayload: { exercise_id: 'exercise-1' },
        }).map((delta) =>
          delta.entityId === 'day-ex-2'
            ? { ...delta, payload: { ...(delta.payload as object), exercise_id: 'exercise-2' } }
            : delta,
        ),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('program_day_exercise', 'position')).toEqual([
      { id: 'day-ex-2', order_value: 0, deleted_at: null },
      { id: 'day-ex-1', order_value: 1, deleted_at: null },
    ]);
  });

  it('applies a planned_set set_index swap without a UNIQUE collision', () => {
    exec(`
      INSERT INTO program (id, name, created_at, updated_at, version)
      VALUES ('program-1', 'Plan', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_week (id, program_id, week_index, created_at, updated_at, version)
      VALUES ('week-1', 'program-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_day (id, program_week_id, day_index, created_at, updated_at, version)
      VALUES ('day-1', 'week-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, created_at, updated_at, version)
      VALUES ('day-ex-1', 'day-1', 'exercise-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO planned_set (id, program_day_exercise_id, set_index, target_reps_min, created_at, updated_at, version)
      VALUES
        ('planned-set-1', 'day-ex-1', 0, 8, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1),
        ('planned-set-2', 'day-ex-1', 1, 10, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'planned_set',
          parentField: 'program_day_exercise_id',
          parentId: 'day-ex-1',
          orderField: 'set_index',
          firstId: 'planned-set-1',
          secondId: 'planned-set-2',
        }),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('planned_set', 'set_index')).toEqual([
      { id: 'planned-set-2', order_value: 0, deleted_at: null },
      { id: 'planned-set-1', order_value: 1, deleted_at: null },
    ]);
  });

  it('applies a workout_session_exercise position swap without a UNIQUE collision', () => {
    exec(`
      INSERT INTO workout_session (id, title, status, started_at, created_at, updated_at)
      VALUES ('session-1', 'Workout', 'completed', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z');
      INSERT INTO workout_session_exercise (
        id, workout_session_id, exercise_id, exercise_name, exercise_type, position, created_at, updated_at
      )
      VALUES
        ('session-ex-1', 'session-1', 'exercise-1', 'Bench Press', 'strength', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z'),
        ('session-ex-2', 'session-1', 'exercise-2', 'Squat', 'strength', 1, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z');
    `);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'workout_session_exercise',
          parentField: 'workout_session_id',
          parentId: 'session-1',
          orderField: 'position',
          firstId: 'session-ex-1',
          secondId: 'session-ex-2',
          extraPayload: {
            exercise_id: 'exercise-1',
            exercise_name: 'Bench Press',
            exercise_type: 'strength',
          },
        }).map((delta) =>
          delta.entityId === 'session-ex-2'
            ? {
                ...delta,
                payload: {
                  ...(delta.payload as object),
                  exercise_id: 'exercise-2',
                  exercise_name: 'Squat',
                },
              }
            : delta,
        ),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('workout_session_exercise', 'position')).toEqual([
      { id: 'session-ex-2', order_value: 0, deleted_at: null },
      { id: 'session-ex-1', order_value: 1, deleted_at: null },
    ]);
  });

  it('applies a workout_set set_index swap without a UNIQUE collision', () => {
    exec(`
      INSERT INTO workout_session (id, title, status, started_at, created_at, updated_at)
      VALUES ('session-1', 'Workout', 'completed', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z');
      INSERT INTO workout_session_exercise (
        id, workout_session_id, exercise_id, exercise_name, exercise_type, position, created_at, updated_at
      )
      VALUES ('session-ex-1', 'session-1', 'exercise-1', 'Bench Press', 'strength', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z');
      INSERT INTO workout_set (
        id, workout_session_exercise_id, set_index, weight, reps, is_completed, created_at, updated_at
      )
      VALUES
        ('workout-set-1', 'session-ex-1', 0, 100, 5, 1, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z'),
        ('workout-set-2', 'session-ex-1', 1, 105, 4, 1, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z');
    `);

    expect(
      applyDeltas(
        swapDeltas({
          entityType: 'workout_set',
          parentField: 'workout_session_exercise_id',
          parentId: 'session-ex-1',
          orderField: 'set_index',
          firstId: 'workout-set-1',
          secondId: 'workout-set-2',
          extraPayload: { is_completed: 1 },
        }),
      ),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('workout_set', 'set_index')).toEqual([
      { id: 'workout-set-2', order_value: 0, deleted_at: null },
      { id: 'workout-set-1', order_value: 1, deleted_at: null },
    ]);
  });

  it('does not stage tombstone or delete deltas as active ordered upserts', () => {
    exec(`
      INSERT INTO program (id, name, created_at, updated_at, version)
      VALUES ('program-1', 'Plan', '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
      INSERT INTO program_week (id, program_id, week_index, created_at, updated_at, version)
      VALUES
        ('week-1', 'program-1', 0, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1),
        ('week-2', 'program-1', 1, '2026-05-24T10:00:00.000Z', '2026-05-24T10:00:00.000Z', 1);
    `);

    expect(
      applyDeltas([
        {
          entityType: 'program_week',
          entityId: 'week-1',
          opType: 'upsert',
          payload: {
            id: 'week-1',
            program_id: 'program-1',
            week_index: 1,
            deleted_at: '2026-05-24T12:00:00.000Z',
            updated_at: '2026-05-24T12:00:00.000Z',
            version: 2,
          },
        },
        {
          entityType: 'program_week',
          entityId: 'week-2',
          opType: 'delete',
          payload: {
            id: 'week-2',
            program_id: 'program-1',
            week_index: 0,
            deleted_at: '2026-05-24T12:00:00.000Z',
            updated_at: '2026-05-24T12:00:00.000Z',
            version: 2,
          },
        },
      ]),
    ).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows('program_week', 'week_index')).toEqual([
      { id: 'week-1', order_value: 0, deleted_at: '2026-05-24T12:00:00.000Z' },
      { id: 'week-2', order_value: 1, deleted_at: '2026-05-24T12:00:00.000Z' },
    ]);
  });

  it('keeps non-ordered upserts on the normal single-upsert path', () => {
    expect(
      applyDeltas([
        {
          entityType: 'exercise',
          entityId: 'exercise-1',
          opType: 'upsert',
          payload: {
            id: 'exercise-1',
            name: 'Updated Bench',
            normalized_name: 'updated bench',
            is_custom: 0,
            exercise_type: 'strength',
            created_at: '2026-05-24T10:00:00.000Z',
            updated_at: '2026-05-24T12:00:00.000Z',
            version: 2,
          },
        },
      ]),
    ).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect(
      query<{ name: string }>('SELECT name FROM exercise WHERE id = ?', ['exercise-1'])[0]?.name,
    ).toBe('Updated Bench');
  });

  it('keeps missing-parent foreign-key failure behavior unchanged', () => {
    expect(() =>
      applyDeltas([
        {
          entityType: 'program_day',
          entityId: 'day-missing-parent',
          opType: 'upsert',
          payload: {
            id: 'day-missing-parent',
            program_week_id: 'missing-week',
            day_index: 0,
            created_at: '2026-05-24T10:00:00.000Z',
            updated_at: '2026-05-24T12:00:00.000Z',
            version: 1,
          },
        },
      ]),
    ).toThrow('Unable to apply deltas due to missing parents: program_day:day-missing-parent');
  });
});
