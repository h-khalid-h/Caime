-- Automations and what's saved (PRD §69). An automation is set up by the person it acts for and
-- keeps what matching people send in a collection of theirs; a message is also saved by hand.
-- A saved item points at the message (and the one file or link of it, when that's what was kept)
-- and never copies it, so what's deleted or disappears goes from here too.
create table automations (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text,
  scope_sphere text,
  scope_role text,
  kinds text[] not null,
  words text[] not null default '{}',
  collection text not null,
  enabled boolean not null default true,
  runs integer not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automations_user on automations (user_id) where enabled;

create table saved_items (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  collection text not null,
  conversation_id uuid not null references conversations (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  asset_id uuid references assets (id) on delete cascade,
  automation_id uuid references automations (id) on delete set null,
  created_at timestamptz not null default now()
);
-- Once in a collection: the message, or one file or link of it.
create unique index saved_items_once on saved_items (
  user_id, collection, message_id, coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index saved_items_user on saved_items (user_id, collection, id desc);
create index saved_items_message on saved_items (message_id);

-- What a message shared, found by the message: after it's sent, and when it's deleted.
create index assets_message on assets (message_id);
