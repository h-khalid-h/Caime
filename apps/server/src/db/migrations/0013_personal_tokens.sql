-- A person's own access tokens (PRD §74): they act as that person, on a short list of routes,
-- each behind a permission they chose. Only a hash is kept; the token is shown once.
create table personal_tokens (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  scopes text[] not null,
  prefix text not null,
  token_hash bytea not null unique,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index personal_tokens_user on personal_tokens (user_id) where revoked_at is null;

-- What sent a message someone didn't type in Caishy: their token's name, or an app's.
alter table messages add column sent_via text;
