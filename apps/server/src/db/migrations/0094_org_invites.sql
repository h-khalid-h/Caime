-- Team invites (M16 C3a, review 2026-10-17 §1 H3): an organization's owner or admins hand out a
-- link, or send one to an address, that puts whoever accepts it on the team. The token is kept
-- only as its hash; one sent to an address is for whoever proves that address, and is spent
-- once; a link to share is open to anyone it reaches until it runs out or is taken back.
create table org_invites (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  token_hash bytea not null unique,
  role text not null default 'agent' check (role in ('agent', 'admin')),
  email text,
  created_by uuid references users (id) on delete set null,
  uses int not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index org_invites_by_org on org_invites (org_id, created_at desc) where revoked_at is null;
