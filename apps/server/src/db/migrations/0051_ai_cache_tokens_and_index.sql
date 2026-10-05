-- What a model call read from its cache (and wrote to it) is part of what it cost: kept with the
-- run, as the input and output tokens are (REVIEW-2026-10-05, performance).
alter table ai_runs add column cache_read_tokens int;
alter table ai_runs add column cache_creation_tokens int;

-- (conversation_id, seq desc) was covered by messages_conversation_sender_seq (0002): a btree is
-- read in either direction, and that one carries the sender and deletion too.
drop index if exists messages_conversation_seq;
