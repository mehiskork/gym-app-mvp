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

CREATE INDEX idx_claim_guest_device_type_status
    ON claim (guest_user_id, device_id, claim_type, status);

CREATE INDEX idx_claim_expires_at
    ON claim (expires_at);

CREATE TABLE identity_link (
    guest_user_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);