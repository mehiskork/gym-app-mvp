CREATE TABLE account_identity (
    firebase_subject_id TEXT PRIMARY KEY,
    active_account_owner_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    auth_time_cutoff TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT account_identity_generation_positive CHECK (generation > 0),
    CONSTRAINT account_identity_active_owner_not_blank CHECK (length(trim(active_account_owner_id)) > 0)
);

COMMENT ON TABLE account_identity IS 'Maps reusable Firebase identity to the current TrainFrame account owner incarnation.';
COMMENT ON COLUMN account_identity.firebase_subject_id IS 'Derived Firebase identity in issuer|subject form.';
COMMENT ON COLUMN account_identity.active_account_owner_id IS 'Trusted server-side owner id used for account-mode sync rows.';
COMMENT ON COLUMN account_identity.generation IS 'TrainFrame account incarnation number for this Firebase identity.';
COMMENT ON COLUMN account_identity.auth_time_cutoff IS 'Firebase auth_time must be after this instant to use the active owner.';

CREATE INDEX idx_account_identity_active_owner
    ON account_identity (active_account_owner_id);
