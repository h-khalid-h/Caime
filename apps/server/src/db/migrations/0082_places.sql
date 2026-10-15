-- R92: places. Where a person or an organization is, each a named address shown to whom it's
-- for: a person's by an audience the privacy evaluator reads, an organization's to anyone, its
-- customers or its team. A card copies a place's words; nothing points at a row here.
create table places (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  kind text not null check (kind in ('home', 'work', 'hq', 'branch', 'other')),
  label text,
  country text not null,
  city text,
  area text,
  street text,
  building text,
  floor text,
  unit text,
  postal_code text,
  directions text,
  lat double precision,
  lng double precision,
  -- A person's: an Audience; an organization's: null (org_audience says).
  audience jsonb,
  org_audience text check (org_audience in ('everyone', 'customers', 'team')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is null) <> (org_id is null)),
  check ((lat is null) = (lng is null)),
  check ((user_id is null) or (audience is not null and org_audience is null)),
  check ((org_id is null) or (org_audience is not null and audience is null))
);

create index places_user on places (user_id, position) where user_id is not null;
create index places_org on places (org_id, position) where org_id is not null;
