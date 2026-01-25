ALTER TABLE entity_state
    ADD COLUMN last_received_at TIMESTAMPTZ NOT NULL DEFAULT now();