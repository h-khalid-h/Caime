-- A visitor's report from a page (M16 B6, the DSA's notice and action, Art. 16): who sent it
-- without an account, where they hear back, and the page it came from, kept with the report and
-- gone with it. And a suspended account's appeal (Art. 20): one open at a time, decided by the
-- operator (the suspension lifted or upheld), swept as closed reports are. Expand only.
alter table reports add column visitor_name text;
alter table reports add column visitor_email text;
alter table reports add column page text;
-- What waits on the operator, read as /metrics is scraped (open reports, a child's safety apart).
create index reports_waiting on reports (created_at) where closed_at is null;

create table appeals (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  outcome text check (outcome in ('lifted', 'upheld')),
  note text,
  check ((decided_at is null) = (outcome is null))
);
-- One open appeal per person; the operator's queue; the sweep's.
create unique index appeals_open on appeals (user_id) where decided_at is null;
create index appeals_waiting on appeals (created_at) where decided_at is null;
create index appeals_decided on appeals (decided_at) where decided_at is not null;
