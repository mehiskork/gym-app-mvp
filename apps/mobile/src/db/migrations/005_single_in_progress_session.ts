import type { Migration } from './index';

export const migration005_single_in_progress_session: Migration = {
  id: 5,
  name: 'single_in_progress_session',
  up: `
    -- If multiple in-progress sessions exist (from earlier bugs), keep the most recent and discard the rest.
    UPDATE workout_session
    SET status = 'discarded',
        ended_at = datetime('now'),
        updated_at = datetime('now')
    WHERE status = 'in_progress'
      AND deleted_at IS NULL
      AND id NOT IN (
        SELECT id
        FROM workout_session
        WHERE status = 'in_progress' AND deleted_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      );

    -- Enforce at most one in-progress session.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_session_single_in_progress
      ON workout_session(status)
      WHERE status = 'in_progress' AND deleted_at IS NULL;
  `,
};
