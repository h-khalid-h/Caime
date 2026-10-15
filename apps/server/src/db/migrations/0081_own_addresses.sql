-- R91: email addresses and phone numbers someone adds as theirs, each proven by a code sent to
-- it (by mail, by WhatsApp or by SMS) before it counts. A proven one is one person's alone.
create table own_addresses (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  -- A lower-cased email, or a number in E.164.
  value text not null,
  method text check (method in ('email', 'whatsapp', 'sms')),
  verified_at timestamptz,
  code_hash bytea,
  code_attempts integer not null default 0,
  code_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index own_addresses_user_value on own_addresses (user_id, kind, value);
create unique index own_addresses_proven on own_addresses (kind, value) where verified_at is not null;
