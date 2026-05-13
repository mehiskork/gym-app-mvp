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

jest.mock('../../utils/ids', () => {
  let nextId = 1;

  return {
    newId: jest.fn((prefix: string) => `${prefix}-${nextId++}`),
  };
});

import { exec, query, resetLocalDatabase } from '../db';
import {
  detectAndStorePrsForSession,
  listSessionPrEvents,
  rebuildPrEventsFromWorkoutHistory,
} from '../prRepo';
import { migration001_private_beta_baseline } from '../migrations/001_private_beta_baseline';

type SessionStatus = 'in_progress' | 'completed' | 'discarded';

type EventSummary = {
  type: 'weight' | 'volume' | 'reps_at_weight';
  context: string;
  value: number;
};

const EXERCISE_ID = 'ex_bench_press_barbell';
const NOW = '2026-05-12T10:00:00Z';

function migrate() {
  exec(migration001_private_beta_baseline.up);
}

function seedExercise({
  id = EXERCISE_ID,
  name = 'Barbell Bench Press',
}: {
  id?: string;
  name?: string;
} = {}) {
  exec(
    `
    INSERT INTO exercise (id, name, normalized_name, is_custom, exercise_type)
    VALUES (?, ?, ?, 0, 'strength');
  `,
    [id, name, name.toLowerCase()],
  );
}

function seedSession({
  id,
  status = 'completed',
  deletedAt = null,
}: {
  id: string;
  status?: SessionStatus;
  deletedAt?: string | null;
}) {
  exec(
    `
    INSERT INTO workout_session (
      id, title, status, started_at, ended_at, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?);
  `,
    [id, `Workout ${id}`, status, NOW, status === 'completed' ? NOW : null, deletedAt],
  );
}

function seedSessionExercise({
  id,
  sessionId,
  exerciseId = EXERCISE_ID,
  position = 0,
  deletedAt = null,
}: {
  id: string;
  sessionId: string;
  exerciseId?: string;
  position?: number;
  deletedAt?: string | null;
}) {
  exec(
    `
    INSERT INTO workout_session_exercise (
      id, workout_session_id, exercise_id, exercise_name, exercise_type, position, deleted_at
    )
    VALUES (?, ?, ?, 'Barbell Bench Press', 'strength', ?, ?);
  `,
    [id, sessionId, exerciseId, position, deletedAt],
  );
}

function seedSet({
  id,
  sessionExerciseId,
  setIndex,
  weight,
  reps,
  completed = true,
  deletedAt = null,
}: {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  completed?: boolean;
  deletedAt?: string | null;
}) {
  exec(
    `
    INSERT INTO workout_set (
      id, workout_session_exercise_id, set_index, weight, reps, is_completed, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `,
    [id, sessionExerciseId, setIndex, weight, reps, completed ? 1 : 0, deletedAt],
  );
}

function seedExerciseSession({
  sessionId,
  sets,
  status = 'completed',
  deletedAt = null,
}: {
  sessionId: string;
  sets: Array<[number, number]>;
  status?: SessionStatus;
  deletedAt?: string | null;
}) {
  seedSession({ id: sessionId, status, deletedAt });
  seedSessionExercise({ id: `${sessionId}-wse`, sessionId });
  sets.forEach(([weight, reps], index) => {
    seedSet({
      id: `${sessionId}-set-${index}`,
      sessionExerciseId: `${sessionId}-wse`,
      setIndex: index,
      weight,
      reps,
    });
  });
}

function eventsFor(sessionId: string): EventSummary[] {
  return listSessionPrEvents(sessionId).map((event) => ({
    type: event.pr_type,
    context: event.context,
    value: event.value,
  }));
}

function prEventCount(): number {
  return query<{ n: number }>('SELECT COUNT(*) AS n FROM pr_event;')[0]?.n ?? 0;
}

describe('prRepo PR detection with SQLite', () => {
  beforeEach(() => {
    resetLocalDatabase();
    migrate();
    seedExercise();
  });

  it('creates baseline PR events for the first-ever completed session', () => {
    seedExerciseSession({ sessionId: 'session-first', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-first')).toBe(3);
    expect(eventsFor('session-first')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('creates a weight PR when a completed set is heavier than history', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[100, 5]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[105, 3]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 105 },
      { type: 'reps_at_weight', context: 'w:105.00', value: 3 },
    ]);
  });

  it('creates a reps_at_weight PR when the same weight has more reps', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[100, 5]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 6]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 600 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 6 },
    ]);
  });

  it('does not create duplicate/tie PR events for equal weight and equal reps', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[100, 5]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(0);
    expect(eventsFor('session-current')).toEqual([]);
  });

  it('does not treat lower weight with more reps as a weight PR', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[100, 3]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[90, 10]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 900 },
      { type: 'reps_at_weight', context: 'w:90.00', value: 10 },
    ]);
  });

  it('chooses the best PR candidates from multiple sets in one session', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[100, 5]] });
    seedExerciseSession({
      sessionId: 'session-current',
      sets: [
        [105, 2],
        [100, 6],
        [100, 8],
        [95, 20],
      ],
    });

    expect(detectAndStorePrsForSession('session-current')).toBe(5);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 105 },
      { type: 'volume', context: '', value: 3510 },
      { type: 'reps_at_weight', context: 'w:105.00', value: 2 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 8 },
      { type: 'reps_at_weight', context: 'w:95.00', value: 20 },
    ]);
  });

  it('uses prior historical completed sessions as the comparison baseline', () => {
    seedExerciseSession({ sessionId: 'session-history-light', sets: [[100, 1]] });
    seedExerciseSession({ sessionId: 'session-history-heavy', sets: [[110, 1]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[105, 1]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(1);
    expect(eventsFor('session-current')).toEqual([
      { type: 'reps_at_weight', context: 'w:105.00', value: 1 },
    ]);
  });

  it('does not compare the current session against itself', () => {
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toHaveLength(3);
  });

  it('ignores in-progress and discarded sessions as PR history', () => {
    seedExerciseSession({
      sessionId: 'session-in-progress',
      status: 'in_progress',
      sets: [[200, 5]],
    });
    seedExerciseSession({
      sessionId: 'session-discarded',
      status: 'discarded',
      sets: [[180, 5]],
    });
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('ignores deleted sets, deleted session exercises, and deleted sessions as PR history', () => {
    seedSession({ id: 'session-deleted-set' });
    seedSessionExercise({ id: 'session-deleted-set-wse', sessionId: 'session-deleted-set' });
    seedSet({
      id: 'session-deleted-set-row',
      sessionExerciseId: 'session-deleted-set-wse',
      setIndex: 0,
      weight: 200,
      reps: 5,
      deletedAt: NOW,
    });

    seedSession({ id: 'session-deleted-wse' });
    seedSessionExercise({
      id: 'session-deleted-wse-row',
      sessionId: 'session-deleted-wse',
      deletedAt: NOW,
    });
    seedSet({
      id: 'session-deleted-wse-set',
      sessionExerciseId: 'session-deleted-wse-row',
      setIndex: 0,
      weight: 190,
      reps: 5,
    });

    seedExerciseSession({
      sessionId: 'session-deleted-session',
      sets: [[180, 5]],
      deletedAt: NOW,
    });
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('ignores deleted sets and deleted session exercises in the current session', () => {
    seedSession({ id: 'session-current' });
    seedSessionExercise({ id: 'session-current-active-wse', sessionId: 'session-current' });
    seedSet({
      id: 'session-current-active-set',
      sessionExerciseId: 'session-current-active-wse',
      setIndex: 0,
      weight: 100,
      reps: 5,
    });
    seedSet({
      id: 'session-current-deleted-set',
      sessionExerciseId: 'session-current-active-wse',
      setIndex: 1,
      weight: 200,
      reps: 5,
      deletedAt: NOW,
    });
    seedSessionExercise({
      id: 'session-current-deleted-wse',
      sessionId: 'session-current',
      position: 1,
      deletedAt: NOW,
    });
    seedSet({
      id: 'session-current-deleted-wse-set',
      sessionExerciseId: 'session-current-deleted-wse',
      setIndex: 0,
      weight: 190,
      reps: 5,
    });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('normalizes floating weights through the reps_at_weight key and context', () => {
    seedExerciseSession({ sessionId: 'session-history', sets: [[60.004, 5]] });
    seedExerciseSession({ sessionId: 'session-current', sets: [[60.001, 6]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 360.006 },
      { type: 'reps_at_weight', context: 'w:60.00', value: 6 },
    ]);
  });

  it('formats reps_at_weight context strings with a w: prefix and two decimals', () => {
    seedExerciseSession({ sessionId: 'session-current', sets: [[72.5, 8]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toContainEqual({
      type: 'reps_at_weight',
      context: 'w:72.50',
      value: 8,
    });
  });

  it('is idempotent because INSERT OR IGNORE prevents duplicate PR rows', () => {
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(detectAndStorePrsForSession('session-current')).toBe(0);
    expect(eventsFor('session-current')).toHaveLength(3);
  });

  it('uses INSERT OR IGNORE uniqueness when an equivalent PR event already exists', () => {
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });
    exec(
      `
      INSERT INTO pr_event (id, session_id, exercise_id, pr_type, context, value)
      VALUES ('manual-pr', 'session-current', ?, 'weight', '', 100);
    `,
      [EXERCISE_ID],
    );

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('documents that estimated_1rm PR events are not part of the current repository schema', () => {
    seedExerciseSession({ sessionId: 'session-current', sets: [[100, 5]] });

    detectAndStorePrsForSession('session-current');

    expect(
      query<{ n: number }>("SELECT COUNT(*) AS n FROM pr_event WHERE pr_type = 'estimated_1rm';")[0]
        ?.n,
    ).toBe(0);
  });

  it('rebuilds PR events from workout history without creating outbox rows', () => {
    seedExerciseSession({ sessionId: 'session-first', sets: [[100, 5]] });

    expect(rebuildPrEventsFromWorkoutHistory()).toBe(3);
    expect(prEventCount()).toBe(3);
    expect(query<{ n: number }>('SELECT COUNT(*) AS n FROM outbox_op;')[0]?.n).toBe(0);
  });
});
