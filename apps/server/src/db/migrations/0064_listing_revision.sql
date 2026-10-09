-- A listing's revision (R74): counted up on every change to what Discover shows, so the
-- operator's review names the version it looked at and lets only that one through.
alter table oauth_clients add column listing_rev integer not null default 0;
