CREATE TABLE device (
    device_id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    guest_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN device.guest_user_id IS 'Owner scope id. Currently named guest_user_id for legacy compatibility, but used for both guest/device-owned and account-owned sync scopes.';

CREATE TABLE device_token (
    token_hash TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES device(device_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NULL,
    token_fingerprint TEXT NULL
);

CREATE INDEX idx_device_token_fingerprint ON device_token (token_fingerprint)
WHERE token_fingerprint IS NOT NULL;

CREATE TABLE op_ledger (
    op_id TEXT NOT NULL,
    device_id TEXT NULL,
    guest_user_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT op_ledger_pkey PRIMARY KEY (guest_user_id, op_id)
);

COMMENT ON COLUMN op_ledger.guest_user_id IS 'Owner scope id. Currently named guest_user_id for legacy compatibility, but used for both guest/device-owned and account-owned sync scopes.';
COMMENT ON COLUMN op_ledger.device_id IS 'Device transport id for device-authenticated sync writes; null for account-authenticated sync writes without device transport context.';

CREATE TABLE entity_state (
    guest_user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    row_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guest_user_id, entity_type, entity_id)
);

COMMENT ON COLUMN entity_state.guest_user_id IS 'Owner scope id. Currently named guest_user_id for legacy compatibility, but used for both guest/device-owned and account-owned sync scopes.';

CREATE TABLE change_log (
    change_id BIGSERIAL PRIMARY KEY,
    guest_user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op_type TEXT NOT NULL,
    row_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN change_log.guest_user_id IS 'Owner scope id. Currently named guest_user_id for legacy compatibility, but used for both guest/device-owned and account-owned sync scopes.';

CREATE INDEX idx_change_log_guest_user_change_id ON change_log (guest_user_id, change_id);
CREATE INDEX idx_entity_state_guest_type ON entity_state (guest_user_id, entity_type);

CREATE TABLE claim (
    claim_id UUID PRIMARY KEY,
    claim_type TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    guest_user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ NULL,
    claimed_by_user_id TEXT NULL
);

COMMENT ON COLUMN claim.guest_user_id IS 'Owner scope id for the guest/device-owned data being claimed before account migration.';

CREATE INDEX idx_claim_guest_device_type_status
    ON claim (guest_user_id, device_id, claim_type, status);

CREATE INDEX idx_claim_expires_at
    ON claim (expires_at);

CREATE TABLE identity_link (
    guest_user_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

COMMENT ON COLUMN identity_link.guest_user_id IS 'Original guest/device owner scope id linked to an account owner.';

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

COMMENT ON COLUMN guest_account_migration_audit.guest_user_id IS 'Original guest/device owner scope id migrated to an account owner.';

CREATE INDEX idx_guest_account_migration_audit_user_id
    ON guest_account_migration_audit (user_id);
