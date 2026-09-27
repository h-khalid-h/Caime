-- Billing (PRD §84, R25): a person buys Pro, and an organization's owner or admin buys Business
-- for it, through Stripe. Stripe keeps the card, the invoices and the receipts; Caishy keeps
-- which Stripe customer is whose, where each subscription stands, and which events it has seen.
create table billing_customers (
  -- Stripe's customer id (cus_…).
  id text primary key,
  -- Made with a live key or a test one: a key of the other kind never sees it, so trying billing
  -- out in test mode leaves nothing behind in live mode.
  livemode boolean not null,
  user_id uuid references users (id) on delete set null,
  org_id uuid references organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Ended at Stripe (deleted there, with every subscription it had) once whoever it was for was
  -- deleted, or the organization closed.
  closed_at timestamptz,
  check (user_id is null or org_id is null)
);
create unique index billing_customers_user on billing_customers (user_id, livemode)
  where user_id is not null;
create unique index billing_customers_org on billing_customers (org_id, livemode)
  where org_id is not null;

create table billing_subscriptions (
  -- Stripe's subscription id (sub_…).
  id text primary key,
  customer_id text not null references billing_customers (id) on delete cascade,
  plan text not null check (plan in ('pro', 'business')),
  interval text not null check (interval in ('month', 'year')),
  -- As Stripe says: active, trialing, past_due, canceled, unpaid, incomplete, …
  status text not null,
  -- What it's charged, in the currency's smallest unit (a price changed since doesn't change it).
  amount integer,
  currency text,
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

-- Where a plan came from: the one everyone starts on, the operator's, or what's paid for. Billing
-- changes only a plan it set (or the one everyone starts on), never the operator's.
alter table users add column plan_source text not null default 'default'
  check (plan_source in ('default', 'operator', 'billing'));
alter table organizations add column plan_source text not null default 'default'
  check (plan_source in ('default', 'operator', 'billing'));
update users set plan_source = 'operator' where plan <> 'personal';
update organizations set plan_source = 'operator' where plan <> 'free';
