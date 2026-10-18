-- Link previews (M16 E4c): what a page says of itself (its Open Graph title, description, site
-- and a small copy of its picture), read once by the server for a link sent in a conversation
-- that isn't private and kept for thirty days by the SHA-256 of the link's address, swept daily
-- by when it was read (lib/retention.ts). Nothing here says who sent the link, where, or even
-- the address itself; erasing a message drops the preview of its link. Expand only: a new table.
create table if not exists link_previews (
  id text primary key,
  status text not null check (status in ('ready', 'none')),
  title text,
  description text,
  site_name text,
  image bytea,
  image_width integer,
  image_height integer,
  fetched_at timestamptz not null default now()
);
create index if not exists link_previews_fetched_at on link_previews (fetched_at);
