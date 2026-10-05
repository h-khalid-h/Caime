-- An organization's own checkout (R65): the payment provider account its owner connected (Stripe
-- Connect, a Standard account: the organization's own, paid into directly, Caime takes nothing),
-- and the one-time states that tie a connection's return to who started it.
create table org_checkout (
  org_id uuid primary key references organizations (id) on delete cascade,
  provider text not null default 'stripe',
  account_id text not null,
  livemode boolean not null,
  charges_enabled boolean not null default false,
  connected_by uuid references users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index org_checkout_account on org_checkout (account_id);

create table checkout_states (
  token text primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null
);
create index checkout_states_org on checkout_states (org_id);
create index checkout_states_user on checkout_states (user_id);
