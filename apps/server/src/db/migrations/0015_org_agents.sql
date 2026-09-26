-- An organization's AI agent (PRD §74–75): it answers customers from what the organization told
-- it, as its own member of the team (a users row of kind 'agent'), always marked as an AI, and
-- hands a conversation to a person when it can't answer or is asked to.
create table org_agents (
  org_id uuid primary key references organizations (id) on delete cascade,
  bot_user_id uuid not null references users (id),
  knowledge text not null,
  paused_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Where the agent stands in each conversation: the customer message it last dealt with (so it
-- deals with each once), and when it handed the conversation over (it stays out until resolved).
-- And when the customer last wrote to it resolved: a new question, which the agent may answer
-- until someone on the team writes, even though whoever had it before still has it.
alter table business_threads
  add column agent_seq bigint not null default 0,
  add column agent_handed_over_at timestamptz,
  add column reopened_at timestamptz;
