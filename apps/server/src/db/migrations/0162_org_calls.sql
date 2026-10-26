-- A customer calls an organization (M16 H8a, R111 (a)). Who may call it is its own to say
-- (`calls_from`, nobody until its owner or an admin turns it on); a call to it marks the
-- organization (`calls.org_id`) and rings its team in the thread, one row each in
-- `call_team_rings`, until one of them answers and becomes the call's callee. A ring turned down
-- is that person's alone; the call goes on ringing for the rest.
alter table organizations
  add column if not exists calls_from text not null default 'nobody'
  check (calls_from in ('nobody', 'customers'));
alter table calls add column if not exists org_id uuid references organizations (id) on delete set null;
create index if not exists calls_org on calls (org_id);
create table if not exists call_team_rings (
  call_id uuid not null references calls (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  declined_at timestamptz,
  primary key (call_id, user_id)
);
create index if not exists call_team_rings_user on call_team_rings (user_id);
