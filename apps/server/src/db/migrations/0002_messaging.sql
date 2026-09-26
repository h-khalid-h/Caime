-- Polls, "delete for me", and read receipts per message for groups.

create table poll_votes (
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, option_id)
);

create table hidden_messages (
  message_id uuid not null references messages (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- Unread counts are computed per participant; this keeps them cheap.
create index messages_conversation_sender_seq on messages (conversation_id, seq) include (sender_id, deleted_at);
create index messages_mentions on messages using gin (mentions);
