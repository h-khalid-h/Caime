-- A handle someone lets go of (a new one in Profile, a deleted account, or one the operator
-- moves, modules/admin.ts) is held from everyone for a year (lib/handles.ts), so a link to it
-- that's out in the world (cai.me/@handle, R35: on a card, in a signature, as a QR code) can't
-- come to open someone else. Only the handle and the days, never whose it was, so nothing of a
-- deleted account is kept with it. An organization's handle stays with it, closed or not: its
-- row does.
create table released_handles (
  handle citext primary key,
  released_on date not null,
  held_until date not null
);
-- The daily sweep forgets a hold once it's over (lib/retention.ts).
create index released_handles_held_until on released_handles (held_until);
