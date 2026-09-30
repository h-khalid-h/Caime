-- Email, at last (R48): a code to confirm the address at sign-up, and a link to reset a
-- forgotten password. Codes and tokens are kept hashed, live an hour or a day, and work once.
create table email_codes (
  user_id uuid primary key references users (id) on delete cascade,
  code_hash bytea not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table password_resets (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_resets_user on password_resets (user_id);
