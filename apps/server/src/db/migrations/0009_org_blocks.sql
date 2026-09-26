-- A person blocking an organization (PRD §55, R15): its team, and its apps' bots, can no longer
-- write to them, and their conversation with it closes until they unblock it.
create table org_blocks (
  user_id uuid not null references users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index org_blocks_org on org_blocks (org_id);
