-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to participants
-- never wait for the scan, and written to run again.
create index concurrently if not exists participants_identity on participants (identity_id) where identity_id is not null;
