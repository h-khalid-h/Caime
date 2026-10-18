-- no-transaction
-- A foreign key that led no index (M16 D2a, see 0107): built concurrently, so writes to saved_items
-- never wait for the scan, and written to run again.
create index concurrently if not exists saved_items_conversation on saved_items (conversation_id);
