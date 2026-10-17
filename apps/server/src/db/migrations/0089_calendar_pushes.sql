-- R96: a connection's Plans use writes the person's meetings and appointments in Caime into their
-- own calendar there, and keeps them in step. One row per event Caime wrote: which card (or time
-- of a series) it stands for, the provider's id for it, when it is, whether it shows busy, and a
-- hash of what was written, so it's written again only when that changes. Nothing of the
-- person's own calendar is kept here: only what Caime itself put there.
create table calendar_pushes (
  account_id uuid not null references connected_accounts (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  uid text not null,
  event_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  holds boolean not null,
  fingerprint text not null,
  pushed_at timestamptz not null default now(),
  primary key (account_id, uid)
);
-- What a person's calendar read leaves out (their own cards, written there by Caime).
create index calendar_pushes_user on calendar_pushes (user_id, start_at);

-- When a connection's plans were last put in step: the sweep takes the longest waiting first.
alter table connected_accounts add column pushed_at timestamptz;

-- A booking says whose catalog it's from (R96, `AppointmentBooking.hostId`), so one from a
-- person's own catalog holds their time while the booker's message request waits. Bookings made
-- before it say so now: an organization's from its business thread, a person's where the other
-- side of a one-to-one offers that item.
update messages m
set payload = jsonb_set(m.payload, '{booking,hostId}', to_jsonb(t.org_id::text))
from business_threads t
where m.kind = 'kit'
  and jsonb_typeof(m.payload -> 'booking') = 'object'
  and not (m.payload -> 'booking' ? 'hostId')
  and t.conversation_id = m.conversation_id;

update messages m
set payload = jsonb_set(m.payload, '{booking,hostId}', to_jsonb(u.id::text))
from conversations c, participants p, users u
where m.kind = 'kit'
  and jsonb_typeof(m.payload -> 'booking') = 'object'
  and not (m.payload -> 'booking' ? 'hostId')
  and c.id = m.conversation_id
  and c.kind = 'direct'
  and p.conversation_id = m.conversation_id
  and p.user_id is distinct from m.sender_id
  and u.id = p.user_id
  and u.booking_items @> jsonb_build_array(jsonb_build_object('id', m.payload -> 'booking' ->> 'itemId'));
