-- Invite links (R1): a standing offer to connect, from one person, to whoever opens it. The
-- inviter's own classification (their private label) is kept here until someone joins, when it
-- becomes their relationship; the context is what the invitee is shown. A token is the only way
-- to find one, and one use is a connection formed.
create table invites (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  token text not null unique,
  relationship jsonb,
  context_sphere text,
  context_org_name text,
  note text,
  uses int not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_by_user on invites (user_id, created_at desc) where revoked_at is null;
