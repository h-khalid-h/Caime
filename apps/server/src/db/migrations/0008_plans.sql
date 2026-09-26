-- Plans for organizations (PRD §84, R23). People's plans have been on users.plan since 0001.
-- Billing is an integration (R25): until one is connected, an operator sets plans.
alter table organizations
  add column plan text not null default 'free'
    check (plan in ('free', 'business', 'enterprise'));
