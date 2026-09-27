-- Organizations' updates (PRD §59): what an organization posts to whoever follows it. Kept apart
-- from conversations and connections: following is neither, and nobody else in it is shown.
create table org_updates (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  -- Who on the team (or which app's bot) posted it, for the team; everyone else sees the
  -- organization.
  posted_by uuid references users (id) on delete set null,
  body text not null,
  -- The poster's own id for it, so a post retried after a lost answer is the same one (ADR-8).
  client_id uuid,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index org_updates_org on org_updates (org_id, id desc) where deleted_at is null;
-- What's new since someone last looked is counted on every Updates open.
create index org_updates_org_created on org_updates (org_id, created_at) where deleted_at is null;
create unique index org_updates_client on org_updates (org_id, client_id) where client_id is not null;

create table org_follows (
  user_id uuid not null references users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  notify boolean not null default false,
  -- Updates after this are new to them.
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
-- Its followers, walked in order when an update goes out.
create index org_follows_org on org_follows (org_id, user_id);

-- Each follower's notification of an update: one each, however often the job that tells them
-- runs, and found again when the update is changed or taken back.
create unique index notifications_update on notifications ((data->>'updateId'), user_id) where kind = 'update';

-- An organization, or one of its updates, can be reported like a person or a message (PRD §55).
alter table reports add column org_id uuid, add column update_id uuid;
