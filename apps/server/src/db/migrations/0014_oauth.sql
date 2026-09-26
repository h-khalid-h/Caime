-- Third-party apps (PRD §74): a developer registers one, and people let it act for them through
-- the authorization code flow with PKCE. Only hashes of secrets, codes and tokens are kept.
create table oauth_clients (
  id uuid primary key,
  client_id text not null unique,
  owner_id uuid not null references users (id) on delete cascade,
  name text not null,
  website text,
  redirect_uris text[] not null,
  -- Null for a public client (an app on a phone or in a browser), which proves itself by PKCE.
  secret_hash bytea,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index oauth_clients_owner on oauth_clients (owner_id) where revoked_at is null;

-- What a person let an app do. Its codes and tokens hang off it: revoking it ends them all.
create table oauth_grants (
  id uuid primary key,
  client_id uuid not null references oauth_clients (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  scopes text[] not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index oauth_grants_live on oauth_grants (client_id, user_id) where revoked_at is null;
create index oauth_grants_user on oauth_grants (user_id) where revoked_at is null;

create table oauth_codes (
  code_hash bytea primary key,
  grant_id uuid not null references oauth_grants (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table oauth_tokens (
  id uuid primary key,
  grant_id uuid not null references oauth_grants (id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  token_hash bytea not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- A refresh token is used once: used again, it leaked, and its grant ends.
  used_at timestamptz,
  revoked_at timestamptz
);
create index oauth_tokens_grant on oauth_tokens (grant_id);
