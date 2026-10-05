-- Collections of a host's catalog (R61): core CatalogCollection[], beside booking_items. An
-- item's address (slug), its line and its collection live on the item itself.
alter table users add column collections jsonb not null default '[]'::jsonb;
alter table organizations add column collections jsonb not null default '[]'::jsonb;
