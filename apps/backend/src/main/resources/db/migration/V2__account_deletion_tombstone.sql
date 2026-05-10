CREATE TABLE account_deletion_tombstone (
    account_owner_id TEXT PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deletion_reason TEXT NOT NULL DEFAULT 'user_delete_me',
    cleared_at TIMESTAMPTZ NULL,
    cleared_by TEXT NULL,
    clear_reason TEXT NULL
);

COMMENT ON TABLE account_deletion_tombstone IS 'Durable account deletion marker. Active rows block same Firebase identity from recreating TrainFrame account data.';
COMMENT ON COLUMN account_deletion_tombstone.account_owner_id IS 'Derived account owner id in issuer|subject form.';
COMMENT ON COLUMN account_deletion_tombstone.cleared_at IS 'Set manually by support/admin to allow the same Firebase identity to use TrainFrame again.';

CREATE INDEX idx_account_deletion_tombstone_active
    ON account_deletion_tombstone (account_owner_id)
    WHERE cleared_at IS NULL;
