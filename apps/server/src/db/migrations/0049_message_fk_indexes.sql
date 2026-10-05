-- Foreign keys to messages that had no index (docs/REVIEW-2026-10-05.md, architecture M7): a
-- message removed for everyone, an erasure or a sweep deleting messages made Postgres scan
-- these tables whole for the rows that point at them, and the inbox's reply lookup walked
-- messages by reply_to_id. Partial where the column is mostly null.
create index if not exists messages_reply_to on messages (reply_to_id) where reply_to_id is not null;
create index if not exists messages_forwarded_from on messages (forwarded_from_id)
  where forwarded_from_id is not null;
create index if not exists tasks_message on tasks (message_id) where message_id is not null;
create index if not exists decisions_message on decisions (message_id) where message_id is not null;
