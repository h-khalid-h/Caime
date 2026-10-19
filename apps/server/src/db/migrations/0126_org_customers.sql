-- What an organization's team keeps about its customers (M16 H3): a note, tags and the values of
-- the fields the organization defines, for its team alone, one record per customer. Expand only:
-- a new table and one column.
create table if not exists org_customers (
  org_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid not null references users (id) on delete cascade,
  note text,
  tags text[] not null default '{}',
  fields jsonb not null default '{}'::jsonb,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, customer_id)
);
create index if not exists org_customers_customer on org_customers (customer_id);
create index if not exists org_customers_updated_by on org_customers (updated_by);

alter table organizations add column if not exists customer_fields jsonb not null default '[]'::jsonb;
