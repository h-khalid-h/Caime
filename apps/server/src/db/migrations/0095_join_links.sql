-- Join links (M16 C3e, review 2026-10-17 §1 H5): a group's or a space's owner or admins hand out
-- a link that lets whoever opens it in, so a group moves over from another app in one message.
-- The token is kept only as its hash; a link is open until it runs out or is taken back, and lets
-- in adults alone (R29). One table for both: a link leads to a group or to a space, never both.
create table join_links (
  id uuid primary key,
  conversation_id uuid references conversations (id) on delete cascade,
  space_id uuid references spaces (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid references users (id) on delete set null,
  uses int not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((conversation_id is null) <> (space_id is null))
);
-- A place's links (its list, the open-link check) and the foreign keys' own lookups, taken-back
-- rows included, so a cascade from a deleted place or account never scans the table.
create index join_links_by_conversation on join_links (conversation_id, created_at desc);
create index join_links_by_space on join_links (space_id, created_at desc);
create index join_links_by_maker on join_links (created_by);
