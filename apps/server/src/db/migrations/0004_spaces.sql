-- Spaces (PRD §40): an optional place around a family, a team, a project or a community, with its
-- people and its conversations. Every space has a General conversation that everyone in it is in;
-- other conversations in a space are open to its members to join.

create table spaces (
  id uuid primary key,
  name text not null,
  purpose text,
  kind text not null
    check (kind in ('family', 'friends', 'team', 'project', 'community', 'school', 'other')),
  created_by uuid references users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table space_members (
  space_id uuid not null references spaces (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  added_by uuid references users (id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (space_id, user_id)
);
create index space_members_user on space_members (user_id) where left_at is null;
-- One owner at a time.
create unique index space_members_one_owner on space_members (space_id)
  where role = 'owner' and left_at is null;

-- The column existed from the start; now it points somewhere.
alter table conversations
  add constraint conversations_space_id_fkey
  foreign key (space_id) references spaces (id) on delete set null;
create index conversations_space on conversations (space_id) where space_id is not null;
