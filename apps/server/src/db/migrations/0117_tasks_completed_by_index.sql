-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to tasks
-- never wait for the scan, and written to run again.
create index concurrently if not exists tasks_completed_by on tasks (completed_by) where completed_by is not null;
