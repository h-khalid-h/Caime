-- Ask to join (M16 C3h, review 2026-10-17 §1 H5's optional half, R97 (3)): a join link may ask
-- its place's owner or admins to accept each person, rather than letting whoever opens it in. A
-- request is one person's ask through one link, pending until someone who runs the place accepts
-- or declines it, or the person withdraws it; a decided one is kept a while (who came in by whom)
-- and swept with spent links. Expand only: a column with a default and a new table.
alter table join_links add column approval boolean not null default false;

create table join_requests (
  id uuid primary key,
  link_id uuid references join_links (id) on delete set null,
  conversation_id uuid references conversations (id) on delete cascade,
  space_id uuid references spaces (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users (id) on delete set null,
  outcome text check (outcome in ('accepted', 'declined', 'withdrawn')),
  check ((conversation_id is null) <> (space_id is null)),
  check ((decided_at is null) = (outcome is null))
);
-- One ask pending per person and place (the list, and asking twice is once).
create unique index join_requests_pending_group on join_requests (conversation_id, user_id)
  where decided_at is null and conversation_id is not null;
create unique index join_requests_pending_space on join_requests (space_id, user_id)
  where decided_at is null and space_id is not null;
-- The foreign keys' own lookups, so a cascade or a set null never scans the table.
create index join_requests_by_user on join_requests (user_id);
create index join_requests_by_link on join_requests (link_id);
create index join_requests_by_decider on join_requests (decided_by) where decided_by is not null;
create index join_requests_by_conversation on join_requests (conversation_id)
  where conversation_id is not null;
create index join_requests_by_space on join_requests (space_id) where space_id is not null;
