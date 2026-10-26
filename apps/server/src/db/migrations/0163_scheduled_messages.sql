-- Messages written now and sent later (M16 E8b, review 2026-10-17 §7's parity "scheduled
-- messages"): the sender's words and what they answer, kept until `send_at`, when the
-- `message.scheduled` job sends them through `sendMessage` as if typed then (every rule read
-- again at that moment) and deletes the row. One that can't go keeps its row with why
-- (`failure`, `failed_at`) for the sender to see. A private conversation's words never reach
-- the server, so none is kept for one. Gone with the conversation or the sender's account.
create table if not exists scheduled_messages (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid not null references users (id) on delete cascade,
  client_id text not null,
  body text not null,
  reply_to_id uuid references messages (id) on delete set null,
  mentions uuid[] not null default '{}',
  send_at timestamptz not null,
  failure text,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index if not exists scheduled_messages_conversation
  on scheduled_messages (conversation_id, sender_id);
create index if not exists scheduled_messages_reply_to
  on scheduled_messages (reply_to_id) where reply_to_id is not null;
