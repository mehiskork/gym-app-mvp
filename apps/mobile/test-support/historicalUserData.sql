-- Synthetic baseline-compatible records. No production data or credentials.
INSERT INTO exercise (id, name, normalized_name, is_custom, owner_user_id, notes)
VALUES ('exercise-1', 'Custom press', 'custom press', 1, 'account-1', 'Keep this note');
INSERT INTO program (id, name, owner_user_id, version, last_modified_by_device_id)
VALUES ('plan-1', 'My saved plan', 'account-1', 4, 'device-1');
INSERT INTO program_week (id, program_id, week_index) VALUES ('week-1', 'plan-1', 0);
INSERT INTO program_day (id, program_week_id, day_index, name)
VALUES ('day-1', 'week-1', 0, 'Day A');
INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
VALUES ('planned-exercise-1', 'day-1', 'exercise-1', 0, 'Slow lowering');
INSERT INTO planned_set (id, program_day_exercise_id, set_index, target_weight, target_reps_min)
VALUES ('planned-set-1', 'planned-exercise-1', 0, 42.5, 8);
INSERT INTO workout_session
  (id, source_workout_plan_id, source_program_day_id, title, status, started_at, ended_at, workout_note)
VALUES
  ('history-1', 'plan-1', 'day-1', 'Completed workout', 'completed', '2026-08-01T10:00:00Z',
   '2026-08-01T11:00:00Z', 'Personal record');
INSERT INTO workout_session
  (id, title, status, started_at, rest_timer_end_at, rest_timer_seconds, rest_timer_label)
VALUES
  ('active-1', 'Unfinished workout', 'in_progress', '2026-08-02T10:00:00Z',
   '2026-08-02T10:03:00Z', 180, 'Rest');
INSERT INTO workout_session_exercise
  (id, workout_session_id, source_program_day_exercise_id, exercise_id, exercise_name, position, notes)
VALUES ('performed-1', 'history-1', 'planned-exercise-1', 'exercise-1', 'Custom press', 0, 'Good form');
INSERT INTO workout_set
  (id, workout_session_exercise_id, set_index, weight, reps, rpe, notes, is_completed)
VALUES ('set-1', 'performed-1', 0, 42.5, 8, 7.5, 'Keep exact values', 1);
INSERT INTO workout_set
  (id, workout_session_exercise_id, set_index, weight, reps, is_completed, deleted_at)
VALUES ('deleted-set-1', 'performed-1', 1, 45, 5, 1, '2026-08-01T11:00:00Z');
INSERT INTO pr_event (id, session_id, exercise_id, pr_type, value)
VALUES ('pr-1', 'history-1', 'exercise-1', 'weight', 42.5);
INSERT INTO app_meta (key, value) VALUES
  ('device_id', 'device-1'), ('claimed_user_id', 'account-1'), ('claimed', 'true'),
  ('sync_paused', 'false'), ('unfinished_workout_reminder', '{"sessionId":"active-1"}');
INSERT INTO app_log (id, at, level, tag, message, context_json)
VALUES (1, 1785578400000, 'info', 'test', 'Synthetic history', '{"sessionId":"history-1"}');
INSERT INTO outbox_op
  (id, op_id, device_id, user_id, entity_type, entity_id, op_type, payload_json, status,
   attempt_count, last_error, next_attempt_at, last_attempt_at)
VALUES
  ('outbox-1', 'operation-1', 'device-1', 'account-1', 'workout_set', 'set-1', 'upsert',
   '{"id":"set-1","weight":42.5,"reps":8}', 'pending', 2, 'network unavailable',
   '2026-08-02T11:00:00Z', '2026-08-02T10:00:00Z'),
  ('outbox-2', 'operation-2', 'device-1', 'account-1', 'workout_set', 'deleted-set-1', 'delete',
   '{"id":"deleted-set-1","deleted_at":"2026-08-01T11:00:00Z"}', 'in_flight', 1, NULL,
   NULL, '2026-08-02T10:00:00Z');
UPDATE sync_state SET cursor = 'cursor-to-preserve', last_sync_at = '2026-08-01T11:00:00Z',
  consecutive_failures = 2, backoff_until = '2026-08-02T11:00:00Z', last_error = 'offline';
INSERT INTO sync_run (id, status, cursor_before, cursor_after, ops_sent, error_message)
VALUES ('sync-run-1', 'failed', 'cursor-to-preserve', 'cursor-to-preserve', 2, 'offline');
