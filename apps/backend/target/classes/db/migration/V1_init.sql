CREATE TABLE device (
    device_id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    guest_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_token (
    token_hash TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES device(device_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NULL
);

CREATE TABLE op_ledger (
    op_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    guest_user_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entity_state (
    guest_user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    row_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guest_user_id, entity_type, entity_id)
);

CREATE TABLE change_log (
    change_id BIGSERIAL PRIMARY KEY,
    guest_user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op_type TEXT NOT NULL,
    row_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_change_log_guest_user_change_id ON change_log (guest_user_id, change_id);
CREATE INDEX idx_entity_state_guest_type ON entity_state (guest_user_id, entity_type);