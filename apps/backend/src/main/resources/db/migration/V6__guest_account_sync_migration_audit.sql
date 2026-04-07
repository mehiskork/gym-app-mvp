CREATE TABLE guest_account_migration_audit (
    guest_user_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    first_attempted_at TIMESTAMPTZ NOT NULL,
    last_attempted_at TIMESTAMPTZ NOT NULL,
    attempt_count BIGINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NULL,
    entity_state_rows_moved BIGINT NOT NULL DEFAULT 0,
    change_log_rows_moved BIGINT NOT NULL DEFAULT 0,
    op_ledger_rows_moved BIGINT NOT NULL DEFAULT 0,
    entity_conflicts_resolved BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_guest_account_migration_audit_user_id
    ON guest_account_migration_audit (user_id);