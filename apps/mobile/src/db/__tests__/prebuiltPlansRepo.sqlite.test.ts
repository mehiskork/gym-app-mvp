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
import { query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import { importPrebuiltPlan } from '../prebuiltPlansRepo';

type CountRow = { n: number };
type ProgramRow = { id: string; name: string; description: string | null; is_template: number };
type PlannedSetRow = {
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
};
type OutboxRow = {
  entity_type: string;
  entity_id: string;
  op_type: string;
  status: string;
  payload_json: string;
};

const templateId = 'prebuilt_v_taper_project_3_day';

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

describe('prebuiltPlansRepo template import with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('persists the imported planner tree and enqueues outbox rows from stored snapshots', () => {
    const programId = importPrebuiltPlan(templateId);

    const program = query<ProgramRow>(
      `
      SELECT id, name, description, is_template
      FROM program
      WHERE id = ?;
    `,
      [programId],
    )[0];
    expect(program).toEqual({
      id: programId,
      name: 'V-Taper Project',
      description: 'Upper body: Horizontal Strength, Vertical Strength, Upper Volume / Hypertrophy',
      is_template: 0,
    });

    const weekCount = count('SELECT COUNT(*) AS n FROM program_week WHERE program_id = ?;', [
      programId,
    ]);
    const dayCount = count(
      `
      SELECT COUNT(*) AS n
      FROM program_day pd
      JOIN program_week pw ON pw.id = pd.program_week_id
      WHERE pw.program_id = ?;
    `,
      [programId],
    );
    const dayExerciseCount = count(
      `
      SELECT COUNT(*) AS n
      FROM program_day_exercise pde
      JOIN program_day pd ON pd.id = pde.program_day_id
      JOIN program_week pw ON pw.id = pd.program_week_id
      WHERE pw.program_id = ?;
    `,
      [programId],
    );
    const plannedSetCount = count(
      `
      SELECT COUNT(*) AS n
      FROM planned_set ps
      JOIN program_day_exercise pde ON pde.id = ps.program_day_exercise_id
      JOIN program_day pd ON pd.id = pde.program_day_id
      JOIN program_week pw ON pw.id = pd.program_week_id
      WHERE pw.program_id = ?;
    `,
      [programId],
    );

    expect(weekCount).toBe(1);
    expect(dayCount).toBe(3);
    expect(dayExerciseCount).toBeGreaterThan(0);
    expect(plannedSetCount).toBeGreaterThan(0);

    const plannedSets = query<PlannedSetRow>(
      `
      SELECT ps.target_reps_min, ps.target_reps_max, ps.rest_seconds
      FROM planned_set ps
      JOIN program_day_exercise pde ON pde.id = ps.program_day_exercise_id
      JOIN program_day pd ON pd.id = pde.program_day_id
      JOIN program_week pw ON pw.id = pd.program_week_id
      WHERE pw.program_id = ?
      ORDER BY pd.day_index, pde.position, ps.set_index;
    `,
      [programId],
    );
    expect(plannedSets.slice(0, 4)).toEqual([
      { target_reps_min: 6, target_reps_max: 6, rest_seconds: null },
      { target_reps_min: 6, target_reps_max: 6, rest_seconds: null },
      { target_reps_min: 6, target_reps_max: 6, rest_seconds: null },
      { target_reps_min: 6, target_reps_max: 6, rest_seconds: null },
    ]);
    expect(plannedSets.every((row) => row.target_reps_min === row.target_reps_max)).toBe(true);
    expect(plannedSets.every((row) => row.rest_seconds === null)).toBe(true);

    const outboxRows = query<OutboxRow>(
      `
      SELECT entity_type, entity_id, op_type, status, payload_json
      FROM outbox_op
      ORDER BY created_at, id;
    `,
    );
    expect(outboxRows).toHaveLength(1 + weekCount + dayCount + dayExerciseCount + plannedSetCount);
    expect(outboxRows.map((row) => row.entity_type)).toEqual(
      expect.arrayContaining([
        'program',
        'program_week',
        'program_day',
        'program_day_exercise',
        'planned_set',
      ]),
    );
    expect(outboxRows.every((row) => row.op_type === 'upsert')).toBe(true);
    expect(outboxRows.every((row) => row.status === 'pending')).toBe(true);

    const outboxEntityKeys = new Set(
      outboxRows.map((row) => `${row.entity_type}:${row.entity_id}`),
    );
    expect(outboxEntityKeys.has(`program:${programId}`)).toBe(true);
    expect(outboxRows.filter((row) => row.entity_type === 'planned_set')).toHaveLength(
      plannedSetCount,
    );
    expect(
      outboxRows
        .filter((row) => row.entity_type === 'planned_set')
        .every((row) => JSON.parse(row.payload_json).rest_seconds === null),
    ).toBe(true);
  });

  it('rejects importing the same template twice without writing another planner tree', () => {
    importPrebuiltPlan(templateId);
    const rowCountsBefore = {
      programs: count('SELECT COUNT(*) AS n FROM program;'),
      weeks: count('SELECT COUNT(*) AS n FROM program_week;'),
      days: count('SELECT COUNT(*) AS n FROM program_day;'),
      dayExercises: count('SELECT COUNT(*) AS n FROM program_day_exercise;'),
      plannedSets: count('SELECT COUNT(*) AS n FROM planned_set;'),
      outbox: count('SELECT COUNT(*) AS n FROM outbox_op;'),
    };

    expect(() => importPrebuiltPlan(templateId)).toThrow(
      'Prebuilt plan already added: V-Taper Project',
    );

    expect({
      programs: count('SELECT COUNT(*) AS n FROM program;'),
      weeks: count('SELECT COUNT(*) AS n FROM program_week;'),
      days: count('SELECT COUNT(*) AS n FROM program_day;'),
      dayExercises: count('SELECT COUNT(*) AS n FROM program_day_exercise;'),
      plannedSets: count('SELECT COUNT(*) AS n FROM planned_set;'),
      outbox: count('SELECT COUNT(*) AS n FROM outbox_op;'),
    }).toEqual(rowCountsBefore);
  });
});
