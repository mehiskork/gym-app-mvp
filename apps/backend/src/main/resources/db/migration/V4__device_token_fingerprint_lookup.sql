ALTER TABLE device_token ADD COLUMN token_fingerprint TEXT NULL;

CREATE INDEX idx_device_token_fingerprint ON device_token (token_fingerprint)
WHERE token_fingerprint IS NOT NULL;