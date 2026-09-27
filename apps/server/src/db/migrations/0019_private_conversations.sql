-- Private conversations (R18, PRD §61): end to end encrypted. The server keeps each device's
-- public keys, to hand to whoever writes to it, and each message only as an envelope it can't
-- read (messages.sealed; its body stays empty).
create table e2ee_devices (
  -- Chosen by the device, so it can sign its own introduction before it's registered.
  id uuid primary key,
  -- Whose it is. Not a foreign key: a deleted account's devices stay (their public keys only), so
  -- what it sent can still be checked by those it sent it to.
  user_id uuid not null,
  -- The session the device registered in: once that session ends (signed out, revoked, expired,
  -- the account deleted), so does the device, and nothing is sealed for it any more.
  session_id uuid references sessions (id) on delete set null,
  name text,
  encryption_key jsonb not null,
  signing_key jsonb not null,
  -- The device of the same person that approved it; null for the first of a chain, which vouches
  -- for itself.
  introduced_by uuid references e2ee_devices (id),
  -- The approver's signature (or, the first, its own) over whose it is and its keys.
  introduction text not null,
  -- Approved (or the first): only then is anything sealed for it.
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index e2ee_devices_user on e2ee_devices (user_id) where revoked_at is null;
create unique index e2ee_devices_session on e2ee_devices (session_id)
  where revoked_at is null and session_id is not null;

alter table messages add column sealed jsonb;
