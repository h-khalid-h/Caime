-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to tasks
-- never wait for the scan, and written to run again.
create index concurrently if not exists tasks_context on tasks (context_id) where context_id is not null;
