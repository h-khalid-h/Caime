-- R84: guests in a meeting. Inviting the first guest gives the meeting a space of its own (a
-- group conversation), where a copy of its card lives on; the original card says it moved.
create table meeting_spaces (
  -- The card the meeting was agreed on, and the copy in its space.
  message_id uuid primary key references messages(id) on delete cascade,
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  space_message_id uuid not null unique references messages(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Who was invited by address, and the link that is their way in: kept hashed, one per guest and
-- meeting, ended when the guest is removed.
create table meeting_guests (
  id uuid primary key,
  space_message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  invited_by uuid references users(id) on delete set null,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (space_message_id, user_id)
);
create index meeting_guests_user on meeting_guests (user_id);
