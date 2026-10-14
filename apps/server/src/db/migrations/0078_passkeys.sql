-- R36: passkeys. A person's WebAuthn credentials, by the id the authenticator gave them: the
-- public key and what it says of itself, never a secret, a biometric or a private key. A
-- ceremony's challenge is kept for one use, a few minutes (lib/passkeys.ts).
create table passkeys (
  id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  backed_up boolean not null default false,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_user on passkeys (user_id, created_at);

create table passkey_challenges (
  id uuid primary key,
  user_id uuid references users (id) on delete cascade,
  purpose text not null check (purpose in ('register', 'signin')),
  challenge text not null,
  expires_at timestamptz not null
);
create index passkey_challenges_due on passkey_challenges (expires_at);
create index passkey_challenges_user on passkey_challenges (user_id) where user_id is not null;
