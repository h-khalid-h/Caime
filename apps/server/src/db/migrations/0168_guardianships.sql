-- R122: a child on Caime with a parent's or guardian's consent. A parent on Caime makes a link for
-- one child (kept as its hash), the child signs up through it, and the parent consents on the
-- child's own account; until the child reaches the age where they live, a request to or from them
-- waits on that guardian.
create table if not exists family_links (
  id uuid primary key,
  guardian_id uuid not null references users(id) on delete cascade,
  token_hash bytea not null unique,
  -- The name the parent gave the child, said on the link's page and to the parent alone.
  child_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  spent_by uuid references users(id) on delete set null,
  spent_at timestamptz
);
create index if not exists family_links_guardian on family_links (guardian_id);
create index if not exists family_links_spent_by on family_links (spent_by);

create table if not exists guardianships (
  id uuid primary key,
  child_id uuid not null references users(id) on delete cascade,
  -- The consent is the child's record: it stays when the parent's own account goes (null then).
  guardian_id uuid references users(id) on delete set null,
  link_id uuid references family_links(id) on delete set null,
  asked_at timestamptz not null,
  -- The consent itself: when, to which words (their version), and how the guardian was known.
  consented_at timestamptz,
  consent_version text,
  method text check (method in ('account', 'account_age_checked')),
  ended_at timestamptz,
  ended_why text check (ended_why in ('withdrawn', 'not_mine', 'lapsed', 'guardian_gone', 'operator'))
);
-- One guardian at a time for a child.
create unique index if not exists guardianships_live_child
  on guardianships (child_id) where ended_at is null;
create index if not exists guardianships_child on guardianships (child_id);
create index if not exists guardianships_guardian on guardianships (guardian_id);
create index if not exists guardianships_link on guardianships (link_id);

-- A request to or from a supervised child reaches the other side only once this guardian says yes;
-- one waiting on a parent whose account is gone goes with it, never through.
alter table connection_requests
  add column if not exists waits_on_guardian uuid references users(id) on delete cascade;
create index if not exists connection_requests_waits_on_guardian
  on connection_requests (waits_on_guardian);
