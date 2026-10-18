-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to users
-- never wait for the scan, and written to run again.
create index concurrently if not exists users_invited_by on users (invited_by) where invited_by is not null;
