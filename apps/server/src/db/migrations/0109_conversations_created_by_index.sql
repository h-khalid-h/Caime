-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to conversations
-- never wait for the scan, and written to run again.
create index concurrently if not exists conversations_created_by on conversations (created_by) where created_by is not null;
