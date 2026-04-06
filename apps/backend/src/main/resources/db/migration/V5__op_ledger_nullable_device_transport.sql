ALTER TABLE op_ledger
    ALTER COLUMN device_id DROP NOT NULL;

COMMENT ON COLUMN op_ledger.device_id IS 'Device transport id for device-authenticated sync writes; null for account-authenticated sync writes without device transport context.';