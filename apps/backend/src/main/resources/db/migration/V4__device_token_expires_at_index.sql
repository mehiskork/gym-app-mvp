CREATE INDEX idx_device_token_expires_at
    ON device_token (expires_at)
    WHERE expires_at IS NOT NULL;
