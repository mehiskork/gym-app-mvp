ALTER TABLE op_ledger
    DROP CONSTRAINT op_ledger_pkey;

ALTER TABLE op_ledger
    ADD CONSTRAINT op_ledger_pkey PRIMARY KEY (guest_user_id, op_id);
