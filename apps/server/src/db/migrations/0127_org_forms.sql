-- An organization's intake forms (M16 H5): the questions it asks a customer before a visit or an
-- order, sent as a Form card in the customer's conversation and answered there; the card keeps a
-- copy of the form and its answers, so a form changed or let go never changes a card sent. Expand
-- only: a new table.
create table if not exists org_forms (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  intro text,
  questions jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists org_forms_org on org_forms (org_id, position);
create index if not exists org_forms_created_by on org_forms (created_by);
