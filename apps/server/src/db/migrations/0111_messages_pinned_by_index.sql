-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to messages
-- never wait for the scan, and written to run again.
create index concurrently if not exists messages_pinned_by on messages (pinned_by) where pinned_by is not null;
