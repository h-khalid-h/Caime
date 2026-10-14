-- R60: stock that runs out. How many of an item sold by the piece a host has left, apart from
-- the catalog it's in (the host's `booking_items`), so an order takes one row's count under its
-- own lock rather than rewriting the catalog, and a save that leaves the count out keeps it
-- (lib/stock.ts). An item with no row isn't counted. The host is an organization or a person,
-- one of the two, and goes with them.
create table item_stock (
  org_id uuid references organizations (id) on delete cascade,
  user_id uuid references users (id) on delete cascade,
  host_id uuid generated always as (coalesce(org_id, user_id)) stored,
  item_id text not null,
  remaining integer not null check (remaining >= 0),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(org_id, user_id) = 1),
  primary key (host_id, item_id)
);
create index item_stock_org on item_stock (org_id) where org_id is not null;
create index item_stock_user on item_stock (user_id) where user_id is not null;

-- What an order took of its host's stock, while it's open: placed or confirmed. Its row goes
-- when the order is on its way (the stock is spent) or is given back, once, when it's cancelled,
-- taken down or erased first; deleting the row is what says it was given (lib/stock.ts).
create table order_stock (
  message_id uuid not null references messages (id) on delete cascade,
  host_id uuid not null,
  item_id text not null,
  quantity integer not null check (quantity > 0),
  primary key (message_id, item_id)
);
