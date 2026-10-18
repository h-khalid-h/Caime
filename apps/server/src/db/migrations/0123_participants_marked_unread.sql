-- Marked unread by the person (M16 E3b): their own reminder to come back to a conversation,
-- cleared when they read it or say so. Expand only: a nullable column, nothing to backfill.
alter table participants add column if not exists marked_unread_at timestamptz;
