-- A task made on a device while it was offline is sent again until it arrives: the device's own
-- id for it makes a second send the first one (ADR-8), as it does for messages.
alter table tasks add column client_id text;
create unique index tasks_client on tasks (owner_id, client_id) where client_id is not null;

-- Someone's calendar feed (PRD §72): a secret address their calendar app reads their actions
-- with a due date and their agreed meetings from. Only its hash is kept; a new one ends the old.
create table calendar_feeds (
  user_id uuid primary key references users (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_read_at timestamptz
);

-- The meetings and appointments a calendar reads, found without reading every message.
create index messages_calendar_cards on messages (conversation_id)
  where kind = 'kit' and deleted_at is null and payload->>'kit' in ('meeting', 'appointment');
