import { migration001_private_beta_baseline } from '../migrations/001_private_beta_baseline';
import { migration002_workout_exercise_plan_note_snapshot } from '../migrations/002_workout_exercise_plan_note_snapshot';
import { migration003_program_day_exercise_planned_cardio_targets } from '../migrations/003_program_day_exercise_planned_cardio_targets';
import { migrations } from '../migrations';

const baselineSql = migration001_private_beta_baseline.up;

function expectCreatesTable(tableName: string) {
  expect(baselineSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`, 'i'));
}

function expectHasColumn(tableName: string, columnName: string) {
  expect(baselineSql).toMatch(
    new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b[\\s\\S]*\\b${columnName}\\b`, 'i'),
  );
}

describe('private beta SQLite baseline migration', () => {
  it('uses one reset-only baseline migration', () => {
    expect(migration001_private_beta_baseline.id).toBe(1);
    expect(migration001_private_beta_baseline.name).toBe('private beta baseline');
    expect(migrations[0]).toBe(migration001_private_beta_baseline);
  });

  it('adds the workout exercise plan note snapshot in migration 2', () => {
    expect(migration002_workout_exercise_plan_note_snapshot.id).toBe(2);
    expect(migration002_workout_exercise_plan_note_snapshot.up).toContain(
      'ADD COLUMN plan_note_snapshot TEXT NULL',
    );
  });

  it('adds planned cardio target columns to program_day_exercise in migration 3', () => {
    expect(migration003_program_day_exercise_planned_cardio_targets.id).toBe(3);
    [
      'planned_cardio_duration_minutes INTEGER NULL',
      'planned_cardio_distance_km REAL NULL',
      'planned_cardio_speed_kph REAL NULL',
      'planned_cardio_incline_percent REAL NULL',
      'planned_cardio_resistance_level REAL NULL',
      'planned_cardio_pace_seconds_per_km REAL NULL',
      'planned_cardio_floors INTEGER NULL',
      'planned_cardio_stair_level REAL NULL',
    ].forEach((columnSql) => {
      expect(migration003_program_day_exercise_planned_cardio_targets.up).toContain(columnSql);
    });
    expect(migrations[2]).toBe(migration003_program_day_exercise_planned_cardio_targets);
  });

  it('creates every expected final table', () => {
    [
      'schema_migrations',
      'exercise',
      'program',
      'program_week',
      'program_day',
      'program_day_exercise',
      'planned_set',
      'workout_session',
      'workout_session_exercise',
      'workout_set',
      'pr_event',
      'app_meta',
      'app_log',
      'outbox_op',
      'sync_state',
      'sync_run',
    ].forEach(expectCreatesTable);
  });

  it('preserves key sync and observability columns', () => {
    expectHasColumn('outbox_op', 'last_attempt_at');
    expectHasColumn('outbox_op', 'next_attempt_at');
    expectHasColumn('outbox_op', 'attempt_count');
    expectHasColumn('sync_state', 'cursor TEXT');
    expectHasColumn('sync_state', 'last_delta_count');
    expectHasColumn('sync_run', 'acks_rejected');
    expectHasColumn('sync_run', 'deltas_applied');
    expectHasColumn('app_log', 'context_json');
  });

  it('preserves app-local and derived-cache tables', () => {
    expectCreatesTable('app_meta');
    expectCreatesTable('pr_event');
    expect(baselineSql).toContain('Local-only metadata');
    expect(baselineSql).toContain('Local-derived cache');
  });

  it('preserves workout linkage, cardio, and active rest timer fields', () => {
    expectHasColumn('workout_session', 'rest_timer_end_at');
    expectHasColumn('workout_session', 'rest_timer_seconds');
    expectHasColumn('workout_session', 'rest_timer_label');
    expectHasColumn('workout_session_exercise', 'source_program_day_exercise_id');
    expectHasColumn('workout_session_exercise', 'exercise_type');
    expectHasColumn('workout_session_exercise', 'cardio_duration_minutes');
    expectHasColumn('workout_session_exercise', 'cardio_distance_km');
  });

  it('omits reset-only historical rest timer count-up columns', () => {
    expect(baselineSql).not.toContain('rest_timer_started_at');
    expect(baselineSql).not.toContain('rest_timer_target_seconds');
  });

  it('preserves important uniqueness constraints and indexes', () => {
    [
      'uq_program_week_program_weekindex',
      'uq_program_day_week_dayindex',
      'uq_day_exercise_day_position',
      'uq_planned_set_exercise_setindex',
      'uq_workout_session_single_in_progress',
      'idx_outbox_op_op_id',
      'idx_outbox_op_status_next_attempt',
      'idx_wse_source_program_day_exercise',
      'uq_pr_event_unique',
      'sync_run_started_at_idx',
      'sync_run_status_started_at_idx',
      'idx_app_log_at',
    ].forEach((indexName) => expect(baselineSql).toContain(indexName));

    expect(baselineSql).toContain("WHERE status = 'in_progress' AND deleted_at IS NULL");
    expect(baselineSql).toContain('CHECK (id = 1)');
    expect(baselineSql).toContain("CHECK (status IN ('success', 'failed'))");
    expect(baselineSql).toContain('CHECK (is_completed IN (0,1))');
    expect(baselineSql).toContain("CHECK (exercise_type IN ('strength', 'cardio'))");
  });
});
