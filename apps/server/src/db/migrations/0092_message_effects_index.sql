-- no-transaction
-- The sweep's own index (0091): what is still due, a handful of rows at any time, never the
-- table. Built concurrently, since messages is the biggest table and a plain build would hold
-- its writes for the scan; a `-- no-transaction` file runs as one statement (db/migrate.ts).
create index concurrently if not exists messages_effects_due on messages (effects_at) where effects_at is not null;
