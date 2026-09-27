-- Organizations' updates (PRD §59): what an organization posts to whoever follows it. Kept apart
-- from conversations and connections: following is neither, and nobody else in it is shown.
create table org_updates (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  -- Who on the team (or which app's bot) posted it, for the team; everyone else sees the
  -- organization.
  posted_by uuid references users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index org_updates_org on org_updates (org_id, id desc) where deleted_at is null;

create table org_follows (
  user_id uuid not null references users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  notify boolean not null default false,
  -- Updates after this are new to them.
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index org_follows_org on org_follows (org_id);
