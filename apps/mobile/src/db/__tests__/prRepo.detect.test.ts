type SessionStatus = 'in_progress' | 'completed' | 'discarded';

type SessionRow = {
  id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  deleted_at: string | null;
};

type SessionExerciseRow = {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  position: number;
  deleted_at: string | null;
};

type SetRow = {
  id: string;
  workout_session_exercise_id: string;
  set_index: number;
  weight: number | null;
  reps: number | null;
  is_completed: number;
  deleted_at: string | null;
};

type PrEventTableRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  pr_type: 'weight' | 'volume' | 'reps_at_weight';
  context: string;
  value: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const mockState = {
  sessions: [] as SessionRow[],
  sessionExercises: [] as SessionExerciseRow[],
  sets: [] as SetRow[],
  prEvents: [] as PrEventTableRow[],
  lastChanges: 0,
};

function roundToSqliteTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function activeCompletedSetsForExercise(exerciseId: string, excludedSessionId: string): SetRow[] {
  return mockState.sets.filter((set) => {
    if (
      set.deleted_at !== null ||
      set.is_completed !== 1 ||
      set.weight === null ||
      set.reps === null
    ) {
      return false;
    }

    const sessionExercise = mockState.sessionExercises.find(
      (row) =>
        row.id === set.workout_session_exercise_id &&
        row.exercise_id === exerciseId &&
        row.deleted_at === null,
    );
    if (!sessionExercise) return false;

    const session = mockState.sessions.find(
      (row) =>
        row.id === sessionExercise.workout_session_id &&
        row.id !== excludedSessionId &&
        row.status === 'completed' &&
        row.deleted_at === null,
    );
    return Boolean(session);
  });
}

function mockExec(sql: string, params: unknown[] = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized.startsWith('INSERT OR IGNORE INTO pr_event')) {
    const [id, sessionId, exerciseId, prType, context, value] = params as [
      string,
      string,
      string,
      PrEventTableRow['pr_type'],
      string,
      number,
    ];
    const existing = mockState.prEvents.some(
      (row) =>
        row.session_id === sessionId &&
        row.exercise_id === exerciseId &&
        row.pr_type === prType &&
        row.context === context,
    );
    if (existing) {
      mockState.lastChanges = 0;
      return;
    }
    mockState.prEvents.push({
      id,
      session_id: sessionId,
      exercise_id: exerciseId,
      pr_type: prType,
      context,
      value,
      created_at: `2026-05-12T00:00:${String(mockState.prEvents.length).padStart(2, '0')}Z`,
      updated_at: `2026-05-12T00:00:${String(mockState.prEvents.length).padStart(2, '0')}Z`,
      deleted_at: null,
    });
    mockState.lastChanges = 1;
    return;
  }

  if (normalized === 'DELETE FROM pr_event WHERE session_id = ?') {
    const [sessionId] = params as [string];
    const before = mockState.prEvents.length;
    mockState.prEvents = mockState.prEvents.filter((row) => row.session_id !== sessionId);
    mockState.lastChanges = before - mockState.prEvents.length;
    return;
  }

  if (normalized === 'DELETE FROM pr_event') {
    mockState.lastChanges = mockState.prEvents.length;
    mockState.prEvents = [];
    return;
  }

  throw new Error(`Unexpected exec SQL: ${normalized}`);
}

function mockQuery(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized === 'SELECT changes() AS n;') {
    return [{ n: mockState.lastChanges }];
  }

  if (normalized.startsWith('SELECT id AS wse_id, exercise_id FROM workout_session_exercise')) {
    const [sessionId] = params as [string];
    return mockState.sessionExercises
      .filter((row) => row.workout_session_id === sessionId && row.deleted_at === null)
      .sort((a, b) => a.position - b.position)
      .map((row) => ({ wse_id: row.id, exercise_id: row.exercise_id }));
  }

  if (normalized.startsWith('SELECT weight, reps, is_completed FROM workout_set')) {
    const [sessionExerciseId] = params as [string];
    return mockState.sets
      .filter(
        (row) => row.workout_session_exercise_id === sessionExerciseId && row.deleted_at === null,
      )
      .sort((a, b) => a.set_index - b.set_index)
      .map((row) => ({ weight: row.weight, reps: row.reps, is_completed: row.is_completed }));
  }

  if (normalized.startsWith('SELECT MAX(ws.weight) AS v')) {
    const [exerciseId, sessionId] = params as [string, string];
    const values = activeCompletedSetsForExercise(exerciseId, sessionId)
      .map((row) => row.weight)
      .filter((value): value is number => value !== null);
    return [{ v: values.length > 0 ? Math.max(...values) : null }];
  }

  if (normalized.startsWith('SELECT MAX(v) AS v FROM')) {
    const [exerciseId, sessionId] = params as [string, string];
    const volumeBySession = new Map<string, number>();
    for (const set of activeCompletedSetsForExercise(exerciseId, sessionId)) {
      if (set.weight === null || set.reps === null) continue;
      const sessionExercise = mockState.sessionExercises.find(
        (row) => row.id === set.workout_session_exercise_id,
      );
      if (!sessionExercise) continue;
      const current = volumeBySession.get(sessionExercise.workout_session_id) ?? 0;
      volumeBySession.set(sessionExercise.workout_session_id, current + set.weight * set.reps);
    }
    const values = [...volumeBySession.values()];
    return [{ v: values.length > 0 ? Math.max(...values) : null }];
  }

  if (normalized.startsWith('SELECT MAX(ws.reps) AS v')) {
    const [exerciseId, sessionId, weight] = params as [string, string, number];
    const values = activeCompletedSetsForExercise(exerciseId, sessionId)
      .filter((row) => row.weight !== null && roundToSqliteTwoDecimals(row.weight) === weight)
      .map((row) => row.reps)
      .filter((value): value is number => value !== null);
    return [{ v: values.length > 0 ? Math.max(...values) : null }];
  }

  if (
    normalized.startsWith('SELECT id, session_id, exercise_id, pr_type, context, value, created_at')
  ) {
    const [sessionId] = params as [string];
    return mockState.prEvents
      .filter((row) => row.session_id === sessionId && row.deleted_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  throw new Error(`Unexpected query SQL: ${normalized}`);
}

jest.mock('../db', () => ({
  exec: jest.fn((sql: string, params: unknown[] = []) => mockExec(sql, params)),
  query: jest.fn((sql: string, params: unknown[] = []) => mockQuery(sql, params)),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn((prefix: string) => `${prefix}-${mockState.prEvents.length + 1}`),
}));

import { detectAndStorePrsForSession, listSessionPrEvents } from '../prRepo';

function resetTables() {
  mockState.sessions = [];
  mockState.sessionExercises = [];
  mockState.sets = [];
  mockState.prEvents = [];
  mockState.lastChanges = 0;
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
  mockState.sessions.push({
    id,
    status,
    started_at: '2026-05-12T10:00:00Z',
    ended_at: status === 'completed' ? '2026-05-12T11:00:00Z' : null,
    deleted_at: deletedAt,
  });
}

function seedSessionExercise({
  id,
  sessionId,
  exerciseId = 'ex_bench_press_barbell',
  position = 0,
  deletedAt = null,
}: {
  id: string;
  sessionId: string;
  exerciseId?: string;
  position?: number;
  deletedAt?: string | null;
}) {
  mockState.sessionExercises.push({
    id,
    workout_session_id: sessionId,
    exercise_id: exerciseId,
    position,
    deleted_at: deletedAt,
  });
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
  mockState.sets.push({
    id,
    workout_session_exercise_id: sessionExerciseId,
    set_index: setIndex,
    weight,
    reps,
    is_completed: completed ? 1 : 0,
    deleted_at: deletedAt,
  });
}

function seedCompletedExerciseSession(sessionId: string, sets: Array<[number, number]>) {
  seedSession({ id: sessionId });
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

function eventsFor(sessionId: string) {
  return listSessionPrEvents(sessionId).map((event) => ({
    type: event.pr_type,
    context: event.context,
    value: event.value,
  }));
}

describe('prRepo PR detection', () => {
  beforeEach(() => {
    resetTables();
    jest.clearAllMocks();
  });

  it('creates baseline PR events for the first completed session', () => {
    seedCompletedExerciseSession('session-first', [[100, 5]]);

    expect(detectAndStorePrsForSession('session-first')).toBe(3);
    expect(eventsFor('session-first')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('creates a weight PR when the completed set is heavier than history', () => {
    seedCompletedExerciseSession('session-history', [[100, 5]]);
    seedCompletedExerciseSession('session-current', [[105, 3]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 105 },
      { type: 'reps_at_weight', context: 'w:105.00', value: 3 },
    ]);
  });

  it('creates a reps-at-weight PR when the same weight has more reps', () => {
    seedCompletedExerciseSession('session-history', [[100, 5]]);
    seedCompletedExerciseSession('session-current', [[100, 6]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 600 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 6 },
    ]);
  });

  it('does not create duplicate PR events for equal weight and equal reps ties', () => {
    seedCompletedExerciseSession('session-history', [[100, 5]]);
    seedCompletedExerciseSession('session-current', [[100, 5]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(0);
    expect(eventsFor('session-current')).toEqual([]);
  });

  it('does not treat lower weight with more reps as a weight PR', () => {
    seedCompletedExerciseSession('session-history', [[100, 3]]);
    seedCompletedExerciseSession('session-current', [[90, 10]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 900 },
      { type: 'reps_at_weight', context: 'w:90.00', value: 10 },
    ]);
  });

  it('chooses the best candidates from multiple sets in one session', () => {
    seedCompletedExerciseSession('session-history', [[100, 5]]);
    seedCompletedExerciseSession('session-current', [
      [105, 2],
      [100, 6],
      [100, 8],
      [95, 20],
    ]);

    expect(detectAndStorePrsForSession('session-current')).toBe(5);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 105 },
      { type: 'volume', context: '', value: 3510 },
      { type: 'reps_at_weight', context: 'w:105.00', value: 2 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 8 },
      { type: 'reps_at_weight', context: 'w:95.00', value: 20 },
    ]);
  });

  it('uses prior completed sessions as the comparison baseline', () => {
    seedCompletedExerciseSession('session-history-light', [[100, 1]]);
    seedCompletedExerciseSession('session-history-heavy', [[110, 1]]);
    seedCompletedExerciseSession('session-current', [[105, 1]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(1);
    expect(eventsFor('session-current')).toEqual([
      { type: 'reps_at_weight', context: 'w:105.00', value: 1 },
    ]);
  });

  it('does not compare the current session against itself', () => {
    seedCompletedExerciseSession('session-current', [[100, 5]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toHaveLength(3);
  });

  it('ignores in-progress and discarded sessions as PR history', () => {
    seedSession({ id: 'session-in-progress', status: 'in_progress' });
    seedSessionExercise({ id: 'session-in-progress-wse', sessionId: 'session-in-progress' });
    seedSet({
      id: 'session-in-progress-set',
      sessionExerciseId: 'session-in-progress-wse',
      setIndex: 0,
      weight: 200,
      reps: 5,
    });
    seedSession({ id: 'session-discarded', status: 'discarded' });
    seedSessionExercise({ id: 'session-discarded-wse', sessionId: 'session-discarded' });
    seedSet({
      id: 'session-discarded-set',
      sessionExerciseId: 'session-discarded-wse',
      setIndex: 0,
      weight: 180,
      reps: 5,
    });
    seedCompletedExerciseSession('session-current', [[100, 5]]);

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
      deletedAt: '2026-05-12T11:00:00Z',
    });
    seedSession({ id: 'session-deleted-wse' });
    seedSessionExercise({
      id: 'session-deleted-wse-row',
      sessionId: 'session-deleted-wse',
      deletedAt: '2026-05-12T11:00:00Z',
    });
    seedSet({
      id: 'session-deleted-wse-set',
      sessionExerciseId: 'session-deleted-wse-row',
      setIndex: 0,
      weight: 190,
      reps: 5,
    });
    seedCompletedExerciseSession('session-deleted-session', [[180, 5]]);
    mockState.sessions.find((row) => row.id === 'session-deleted-session')!.deleted_at =
      '2026-05-12T11:00:00Z';
    seedCompletedExerciseSession('session-current', [[100, 5]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(eventsFor('session-current')).toEqual([
      { type: 'weight', context: '', value: 100 },
      { type: 'volume', context: '', value: 500 },
      { type: 'reps_at_weight', context: 'w:100.00', value: 5 },
    ]);
  });

  it('normalizes floating weights for reps-at-weight context and history comparison', () => {
    seedCompletedExerciseSession('session-history', [[60.004, 5]]);
    seedCompletedExerciseSession('session-current', [[60.001, 6]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(2);
    expect(eventsFor('session-current')).toEqual([
      { type: 'volume', context: '', value: 360.006 },
      { type: 'reps_at_weight', context: 'w:60.00', value: 6 },
    ]);
  });

  it('is idempotent and relies on INSERT OR IGNORE uniqueness for duplicate detection', () => {
    seedCompletedExerciseSession('session-current', [[100, 5]]);

    expect(detectAndStorePrsForSession('session-current')).toBe(3);
    expect(detectAndStorePrsForSession('session-current')).toBe(0);
    expect(eventsFor('session-current')).toHaveLength(3);
  });
});
