-- no-transaction
-- The feed's read (M16 G5): for each of a person's conversations, its messages past a
-- transaction, in transaction order. Built concurrently, so sending never waits for the scan,
-- and written to run again; the rows from before 0138 have no transaction and stay out of it.
create index concurrently if not exists messages_feed on messages (conversation_id, tx) where tx is not null;
