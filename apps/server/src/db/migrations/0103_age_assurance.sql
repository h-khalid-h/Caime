-- Age assurance (M16 B7, REVIEW 2026-10-17 §3): what a check of someone's age found, as Caime
-- keeps it (18 or over or under, by an estimate or a document, when, and until when an under-18
-- outcome holds), never an image or a template; and each check begun, with the provider's
-- answer, so a standing can be explained and a day's checks counted. Expand only.
alter table users add column age_check text check (age_check in ('adult', 'minor'));
alter table users add column age_check_method text check (age_check_method in ('estimate', 'document'));
alter table users add column age_checked_at timestamptz;
alter table users add column age_minor_until timestamptz;

create table age_checks (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  provider text not null,
  -- Where the person comes back to: the web app, or the phone's.
  back text not null check (back in ('web', 'app')),
  -- What asked for it (a trigger), or null: they asked themselves.
  trigger text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('adult', 'minor', 'failed')),
  method text check (method in ('estimate', 'document')),
  confidence text,
  error text
);
create index age_checks_user on age_checks (user_id, created_at);
create index age_checks_created on age_checks (created_at);
