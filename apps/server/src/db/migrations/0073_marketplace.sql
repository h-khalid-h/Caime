-- R80: the marketplace. What a listing says beyond R74's (how it's paid for, its languages, where
-- help and its privacy policy are, what it does with a model, up to five screenshots), and its
-- address in the marketplace, given when it's first listed and held for good, like a handle.
alter table oauth_clients
  add column slug text,
  add column pricing text,
  add column languages text[] not null default '{}',
  add column support_url text,
  add column privacy_url text,
  add column ai_use jsonb,
  add column screenshot_ids uuid[] not null default '{}';

-- One app an address, for good: a revoked app keeps its row, so its address is never given again.
create unique index oauth_clients_slug on oauth_clients (slug) where slug is not null;
