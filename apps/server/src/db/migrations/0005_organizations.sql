-- Organizations (PRD §35–36, R15): a business, a shop, a clinic, a school, a nonprofit or a
-- public service, with its team. An organization proves it controls a domain with a DNS TXT
-- record; its team then shows as "Verified at <name>". Handles share one namespace with people,
-- so an organization can't take a person's handle or the other way round.

create table organizations (
  id uuid primary key,
  name text not null,
  handle citext not null unique,
  kind text not null
    check (kind in ('business', 'shop', 'clinic', 'school', 'nonprofit', 'public_service', 'other')),
  about text,
  website text,
  -- The domain being verified, and the value its TXT record must carry.
  domain text,
  verify_token text,
  verified_at timestamptz,
  created_by uuid references users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A domain is verified by one organization at a time.
create unique index organizations_verified_domain on organizations (lower(domain))
  where verified_at is not null;
create index organizations_name_trgm on organizations using gin (name gin_trgm_ops);

create table org_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  -- Owners and admins run it; the team answers its conversations.
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  title text,
  added_by uuid references users (id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (org_id, user_id)
);
create index org_members_user on org_members (user_id) where left_at is null;
create unique index org_members_one_owner on org_members (org_id)
  where role = 'owner' and left_at is null;

-- The column existed from the start; now it points somewhere.
alter table conversations
  add constraint conversations_org_id_fkey
  foreign key (org_id) references organizations (id) on delete set null;
