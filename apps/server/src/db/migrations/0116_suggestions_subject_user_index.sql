-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to suggestions
-- never wait for the scan, and written to run again.
create index concurrently if not exists suggestions_subject_user on suggestions (subject_user_id) where subject_user_id is not null;
