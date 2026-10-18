-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to conversations
-- never wait for the scan, and written to run again.
create index concurrently if not exists conversations_org on conversations (org_id) where org_id is not null;
