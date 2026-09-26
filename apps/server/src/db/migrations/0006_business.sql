-- The Business inbox (PRD §37–38, R15): one conversation per customer per organization, which
-- its whole team answers as the organization. What state a thread is in is derived from these
-- facts (packages/core/src/business.ts): who has it, when each side last wrote, and the two
-- choices a team makes, escalating and resolving.

create table business_threads (
  conversation_id uuid primary key references conversations (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid references users (id) on delete set null,
  assignee_id uuid references users (id) on delete set null,
  escalated_at timestamptz,
  escalated_by uuid references users (id) on delete set null,
  escalation_note text,
  resolved_at timestamptz,
  resolved_by uuid references users (id) on delete set null,
  -- Each side's last message by its place in the conversation (whose turn it is), and when.
  last_customer_seq bigint not null default 0,
  last_team_seq bigint not null default 0,
  last_customer_at timestamptz,
  last_team_at timestamptz,
  -- How far someone on the team has read: the customer's "read", which a team member joining
  -- later (caught up on arrival) must not advance.
  team_read_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One conversation between a customer and an organization, reopened rather than duplicated.
create unique index business_threads_customer on business_threads (org_id, customer_id)
  where customer_id is not null;
create index business_threads_org on business_threads (org_id, updated_at desc);
create index business_threads_assignee on business_threads (assignee_id)
  where assignee_id is not null and resolved_at is null;
