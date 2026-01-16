import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';

export type PrEventRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  pr_type: 'weight' | 'volume' | 'reps_at_weight';
  context: string; // '' or 'w:60.00'
  value: number;
  created_at: string;
};

function weightKey(weight: number): string {
  // Normalize to 2dp so comparisons are stable.
  return weight.toFixed(2);
}

function contextForWeight(weight: number): string {
  return `w:${weightKey(weight)}`;
}

function insertOrIgnorePrEvent(args: {
  sessionId: string;
  exerciseId: string;
  prType: PrEventRow['pr_type'];
  context: string;
  value: number;
}): number {
  exec(
    `
    INSERT OR IGNORE INTO pr_event (id, session_id, exercise_id, pr_type, context, value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
  `,
    [newId('pr'), args.sessionId, args.exerciseId, args.prType, args.context, args.value],
  );

  // SQLite: changes() returns number of rows changed by the most recent statement.
  return query<{ n: number }>('SELECT changes() AS n;')[0]?.n ?? 0;
}

export function listSessionPrEvents(sessionId: string): PrEventRow[] {
  return query<PrEventRow>(
    `
    SELECT id, session_id, exercise_id, pr_type, context, value, created_at
    FROM pr_event
    WHERE session_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC;
  `,
    [sessionId],
  );
}

/**
 * Derivation function. Does NOT open a transaction itself.
 * Call inside an existing inTransaction() if you need atomicity.
 *
 * Preference: completed sets only (no fallback).
 *
 * 8.5: Uses INSERT OR IGNORE + SELECT changes() to return accurate inserted count.
 */
export function detectAndStorePrsForSession(sessionId: string): number {
  const exRows = query<{ wse_id: string; exercise_id: string }>(
    `
    SELECT id AS wse_id, exercise_id
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND deleted_at IS NULL
    ORDER BY position ASC;
  `,
    [sessionId],
  );

  let inserted = 0;

  for (const ex of exRows) {
    const sets = query<{
      weight: number | null;
      reps: number | null;
      is_completed: number;
    }>(
      `
      SELECT weight, reps, is_completed
      FROM workout_set
      WHERE workout_session_exercise_id = ?
        AND deleted_at IS NULL
      ORDER BY set_index ASC;
    `,
      [ex.wse_id],
    );

    // Completed sets only (per your requirement)
    const pool = sets.filter((s) => s.is_completed === 1);

    const valid = pool.filter(
      (s) =>
        typeof s.weight === 'number' &&
        Number.isFinite(s.weight) &&
        (s.weight as number) > 0 &&
        typeof s.reps === 'number' &&
        Number.isFinite(s.reps) &&
        (s.reps as number) > 0,
    );

    if (valid.length === 0) continue;

    // ----- Candidate metrics for THIS session -----

    // Weight PR candidate (max weight, tie-breaker reps)
    let maxWeight = valid[0].weight as number;
    let maxWeightReps = valid[0].reps as number;
    for (const s of valid) {
      const w = s.weight as number;
      const r = s.reps as number;
      if (w > maxWeight || (w === maxWeight && r > maxWeightReps)) {
        maxWeight = w;
        maxWeightReps = r;
      }
    }

    // Volume PR candidate
    const volume = valid.reduce((sum, s) => sum + (s.weight as number) * (s.reps as number), 0);

    // Reps-at-weight candidates (best reps per normalized weightKey)
    const repsByWeight = new Map<string, number>();
    for (const s of valid) {
      const w = s.weight as number;
      const r = s.reps as number;
      const k = weightKey(w);
      const cur = repsByWeight.get(k) ?? 0;
      if (r > cur) repsByWeight.set(k, r);
    }

    // ----- Compare against HISTORY (completed sessions, excluding this session) -----

    // 1) Weight best (history)
    const histWeight =
      query<{ v: number | null }>(
        `
        SELECT MAX(ws.weight) AS v
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        JOIN workout_session s ON s.id = wse.workout_session_id
        WHERE wse.exercise_id = ?
          AND s.status = 'completed'
          AND s.id != ?
          AND s.deleted_at IS NULL
          AND wse.deleted_at IS NULL
          AND ws.deleted_at IS NULL
          AND ws.is_completed = 1
          AND ws.weight IS NOT NULL
          AND ws.reps IS NOT NULL;
      `,
        [ex.exercise_id, sessionId],
      )[0]?.v ?? null;

    if (histWeight === null || maxWeight > histWeight) {
      inserted += insertOrIgnorePrEvent({
        sessionId,
        exerciseId: ex.exercise_id,
        prType: 'weight',
        context: '',
        value: maxWeight,
      });
    }

    // 2) Volume best (history)
    const histVolume =
      query<{ v: number | null }>(
        `
        SELECT MAX(v) AS v
        FROM (
          SELECT SUM(ws.weight * ws.reps) AS v
          FROM workout_set ws
          JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
          JOIN workout_session s ON s.id = wse.workout_session_id
          WHERE wse.exercise_id = ?
            AND s.status = 'completed'
            AND s.id != ?
            AND s.deleted_at IS NULL
            AND wse.deleted_at IS NULL
            AND ws.deleted_at IS NULL
            AND ws.is_completed = 1
            AND ws.weight IS NOT NULL
            AND ws.reps IS NOT NULL
          GROUP BY s.id
        );
      `,
        [ex.exercise_id, sessionId],
      )[0]?.v ?? null;

    if (histVolume === null || volume > histVolume) {
      inserted += insertOrIgnorePrEvent({
        sessionId,
        exerciseId: ex.exercise_id,
        prType: 'volume',
        context: '',
        value: volume,
      });
    }

    // 3) Reps-at-weight best (history) for each weightKey
    for (const [wKey, reps] of repsByWeight.entries()) {
      const histReps =
        query<{ v: number | null }>(
          `
          SELECT MAX(ws.reps) AS v
          FROM workout_set ws
          JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
          JOIN workout_session s ON s.id = wse.workout_session_id
          WHERE wse.exercise_id = ?
            AND s.status = 'completed'
            AND s.id != ?
            AND s.deleted_at IS NULL
            AND wse.deleted_at IS NULL
            AND ws.deleted_at IS NULL
            AND ws.is_completed = 1
            AND ws.reps IS NOT NULL
            AND ws.weight IS NOT NULL
            AND ROUND(ws.weight, 2) = ?;
        `,
          [ex.exercise_id, sessionId, Number(wKey)],
        )[0]?.v ?? null;

      if (histReps === null || reps > histReps) {
        inserted += insertOrIgnorePrEvent({
          sessionId,
          exerciseId: ex.exercise_id,
          prType: 'reps_at_weight',
          context: contextForWeight(Number(wKey)),
          value: reps,
        });
      }
    }
  }

  return inserted;
}

/**
 * Step 8.4: Recompute PRs for a completed session if any set rows have been
 * updated since PRs were last computed.
 *
 * Uses hard-delete because pr_event is derived and uq_pr_event_unique does not include deleted_at.
 */
export function recomputeSessionPrsIfNeeded(sessionId: string): number {
  return inTransaction(() => {
    const s =
      query<{ status: 'in_progress' | 'completed' | 'discarded' }>(
        `
        SELECT status
        FROM workout_session
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1;
      `,
        [sessionId],
      )[0] ?? null;

    if (!s || s.status !== 'completed') return 0;

    const setTs =
      query<{ ts: string | null }>(
        `
        SELECT MAX(ws.updated_at) AS ts
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?
          AND wse.deleted_at IS NULL;
      `,
        [sessionId],
      )[0]?.ts ?? null;

    const prTs =
      query<{ ts: string | null }>(
        `
        SELECT MAX(updated_at) AS ts
        FROM pr_event
        WHERE session_id = ? AND deleted_at IS NULL;
      `,
        [sessionId],
      )[0]?.ts ?? null;

    // If PRs exist and sets haven't changed since, do nothing.
    if (prTs && setTs && setTs <= prTs) return 0;

    exec('DELETE FROM pr_event WHERE session_id = ?;', [sessionId]);
    return detectAndStorePrsForSession(sessionId);
  });
}
