-- An organization's replies (M16 H2): quick replies its team keeps for what customers ask often,
-- inserted into a reply by "/" and its shortcut, and the two its own automatic-replies account
-- sends: a greeting the first time a customer writes (or after a quiet fortnight) and an away
-- message while it's closed by its bookable hours. Expand only: a new table and three columns.
create table if not exists org_quick_replies (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  shortcut text not null,
  body text not null,
  position integer not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists org_quick_replies_shortcut on org_quick_replies (org_id, shortcut);
create index if not exists org_quick_replies_created_by on org_quick_replies (created_by);

alter table organizations
  add column if not exists greeting text,
  add column if not exists away_message text,
  add column if not exists replies_bot_id uuid references users (id) on delete set null;
create index if not exists organizations_replies_bot on organizations (replies_bot_id);
