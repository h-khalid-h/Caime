-- Apps (PRD §73–75, R16): what an organization connects to Caishy. An app acts through a token
-- with named scopes, may answer customers as a bot (a users row of kind 'bot' on the team, which
-- can never sign in), and hears about the organization's conversations through a signed webhook.

create table org_apps (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  bot_user_id uuid references users (id) on delete set null,
  scopes text[] not null default '{}',
  webhook_url text,
  -- The HMAC key the organization verifies deliveries with; replaced on request.
  webhook_secret text not null,
  events text[] not null default '{}',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index org_apps_org on org_apps (org_id) where revoked_at is null;

-- Only a hash is kept: the token itself is shown once.
create table api_tokens (
  id uuid primary key,
  app_id uuid not null references org_apps (id) on delete cascade,
  prefix text not null,
  token_hash bytea not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index api_tokens_app on api_tokens (app_id) where revoked_at is null;

create table webhook_deliveries (
  id uuid primary key,
  app_id uuid not null references org_apps (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  last_status int,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index webhook_deliveries_app on webhook_deliveries (app_id, created_at desc);
