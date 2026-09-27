-- Billing (PRD §84, R25): a person buys Pro, and an organization's owner or admin buys Business
-- for it, through Stripe. Stripe keeps the card, the invoices and the receipts; Caishy keeps
-- which Stripe customer is whose, where each subscription stands, and which events it has seen.
create table billing_customers (
  -- Stripe's customer id (cus_…).
  id text primary key,
  user_id uuid unique references users (id) on delete set null,
  org_id uuid unique references organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  check (user_id is null or org_id is null)
);

create table billing_subscriptions (
  -- Stripe's subscription id (sub_…).
  id text primary key,
  customer_id text not null references billing_customers (id) on delete cascade,
  plan text not null check (plan in ('pro', 'business')),
  interval text not null check (interval in ('month', 'year')),
  -- As Stripe says: active, trialing, past_due, canceled, unpaid, incomplete, …
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create index billing_subscriptions_customer on billing_subscriptions (customer_id);

-- Each event Stripe sent, once: one sent again changes nothing twice.
create table billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
