-- Review before it sends (M16 G6b, review 2026-10-17 §10 and §11): an organization's AI agent may
-- draft its answer for its team to send, take into their own reply, or let go, rather than send it
-- itself. Off by default: what the agent has done until now.
alter table org_agents add column if not exists review boolean not null default false;

-- The one draft waiting in a conversation, its team's alone: what it would say and do, and the
-- passages of what it was told that the answer rests on. It answers the customer's message `seq`,
-- and stands only while that is still the customer's latest and nobody on the team has written
-- since; a newer draft takes its place.
create table if not exists agent_drafts (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  seq bigint not null,
  action text not null check (action in ('answer', 'resolve', 'book', 'order')),
  body text not null,
  draft jsonb not null default '{}'::jsonb,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists agent_drafts_org on agent_drafts (org_id);

-- What it couldn't answer from what it was told (M16 G6b): the customer's message it handed over,
-- by reference and never a copy, for its owner and admins to add to what it knows. Gone with the
-- message, the conversation's erasure and the organization's clearing.
create table if not exists agent_questions (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references users(id) on delete set null
);
create unique index if not exists agent_questions_message on agent_questions (message_id);
create index if not exists agent_questions_org on agent_questions (org_id, created_at);
create index if not exists agent_questions_conversation on agent_questions (conversation_id);
create index if not exists agent_questions_done_by on agent_questions (done_by);
