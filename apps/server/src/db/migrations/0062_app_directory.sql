-- Apps (R74): what an app says of itself in Discover, where its listing stands, and how many
-- people connected it, kept on the row (the directory is ordered by it, never counted on read).
alter table oauth_clients
  add column tagline text,
  add column description text,
  add column category text,
  add column icon_file_id uuid references files (id) on delete set null,
  add column org_id uuid references organizations (id) on delete set null,
  add column login_url text,
  -- The developer asked for it to be listed; the operator let it show; or declined, and why.
  add column listed_at timestamptz,
  add column reviewed_at timestamptz,
  add column declined_reason text,
  add column connected_count integer not null default 0;

-- Discover's page: the listed apps, most connected first, then the newest.
create index oauth_clients_listed on oauth_clients (connected_count desc, id desc)
  where listed_at is not null and reviewed_at is not null and declined_reason is null
    and revoked_at is null;
-- Its search, by name and tagline.
create index oauth_clients_search on oauth_clients
  using gin ((name || ' ' || coalesce(tagline, '')) gin_trgm_ops)
  where listed_at is not null;
-- The operator's queue.
create index oauth_clients_waiting on oauth_clients (listed_at)
  where listed_at is not null and reviewed_at is null and revoked_at is null;
