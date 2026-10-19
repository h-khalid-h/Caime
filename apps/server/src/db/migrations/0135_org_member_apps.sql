-- An organization's say over its members' own apps (M16 G3, review 2026-10-17 §8 H4): unless its
-- owner or admins let them in, a token acting as one of its team (a personal token, a bridge, an
-- app the person let in) doesn't reach its conversations: the team side of its customer threads,
-- its spaces' conversations, and a thread where they write as its customer. Off by default: an
-- organization's own apps are the way its conversations reach another service.
alter table organizations add column if not exists member_apps boolean not null default false;
