-- no-transaction
-- What an organization's apps were sent of a customer conversation's words goes with the words
-- (M16 B2): a removal or an erasure finds that conversation's deliveries by the conversation
-- their payload names (lib/apps.ts `forgetDeliveries`), never by reading thirty days of every
-- organization's. Built concurrently, since webhook_deliveries is a big table; a
-- `-- no-transaction` file runs as one statement.
create index concurrently if not exists webhook_deliveries_conversation on webhook_deliveries ((payload->'data'->>'conversationId')) where (payload->'data'->>'conversationId') is not null;
