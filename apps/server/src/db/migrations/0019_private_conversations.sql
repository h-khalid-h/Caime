-- Private conversations (R18, PRD §61): end to end encrypted. The server keeps each device's
-- public keys, to hand to whoever writes to it, and each message only as an envelope it can't
-- read (messages.sealed; its body stays empty).
create table e2ee_devices (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  -- The session the device registered in: once that session ends (signed out, revoked, expired),
  -- so does the device, and nothing is sealed for it any more.
  session_id uuid not null references sessions (id) on delete cascade,
  name text,
  encryption_key jsonb not null,
  signing_key jsonb not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index e2ee_devices_user on e2ee_devices (user_id) where revoked_at is null;
create unique index e2ee_devices_session on e2ee_devices (session_id) where revoked_at is null;

alter table messages add column sealed jsonb;
