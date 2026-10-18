-- Asked before being added (M16 B4, review 2026-10-17 §2 M, R97 (3)): someone whose setting says
-- to ask first, or someone under 18 where the place holds people they don't know (R29), is invited
-- to a group or a space rather than put in it. An invitation is that one person's to accept or
-- decline; nothing of the place is theirs until they accept. One pending per person and place; a
-- decided or run-out one is swept with spent invite links. Expand only: a new table.
create table place_invites (
  id uuid primary key,
  conversation_id uuid references conversations (id) on delete cascade,
  space_id uuid references spaces (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  invited_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  outcome text check (outcome in ('accepted', 'declined')),
  check ((conversation_id is null) <> (space_id is null)),
  check ((decided_at is null) = (outcome is null))
);
-- One pending per person and place (inviting twice is once).
create unique index place_invites_pending_group on place_invites (conversation_id, user_id)
  where decided_at is null and conversation_id is not null;
create unique index place_invites_pending_space on place_invites (space_id, user_id)
  where decided_at is null and space_id is not null;
-- The person's own list, and the foreign keys' lookups, so a cascade never scans the table.
create index place_invites_by_user on place_invites (user_id, created_at);
create index place_invites_by_inviter on place_invites (invited_by) where invited_by is not null;
create index place_invites_by_conversation on place_invites (conversation_id)
  where conversation_id is not null;
create index place_invites_by_space on place_invites (space_id) where space_id is not null;
