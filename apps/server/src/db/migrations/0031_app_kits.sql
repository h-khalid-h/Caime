-- Connect Kits an organization's app makes (PRD §74, §86): its own kinds of card, each by a key
-- of the app's choosing. A card keeps the kit it was sent with in its own payload, so a kit can
-- change or go (with its app) without changing a card already in a conversation.
create table app_kits (
  id uuid primary key,
  app_id uuid not null references org_apps (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  key text not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, key)
);
create index app_kits_org on app_kits (org_id);
