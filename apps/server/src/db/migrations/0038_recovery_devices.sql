-- The recovery key (R41): a device of the person's own that every private message is sealed for
-- too, derived from a key they keep, and never signed in. It has no session, so it lives until
-- it's removed or they start over; a new device restores from it.
alter table e2ee_devices add column kind text not null default 'device'
  check (kind in ('device', 'recovery'));
-- One recovery device a person at a time.
create unique index e2ee_devices_recovery on e2ee_devices (user_id)
  where kind = 'recovery' and revoked_at is null;
