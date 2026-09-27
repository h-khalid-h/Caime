-- Group calls (PRD §47): a call in a group conversation of up to eight people, each device in it
-- connected to each other. The calls row is the call (who started it, on which device, how it
-- ended); call_members says where each person is in it.
alter table calls add column is_group boolean not null default false;
-- Goes up with every change to who's in a group call, so a device can tell older news.
alter table calls add column rev integer not null default 0;

create table call_members (
  call_id uuid not null references calls (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  state text not null check (state in ('ringing', 'joined', 'left', 'declined', 'missed')),
  -- The device they're in it on, while they are: signals pass only between joined devices.
  device text,
  rung_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  -- A joined device says it's still there; one that stops is taken out of the call.
  seen_at timestamptz,
  primary key (call_id, user_id)
);
create index call_members_live on call_members (user_id) where state in ('ringing', 'joined');
-- A device is in a call for one person only: signals are addressed to devices.
create unique index call_members_device on call_members (call_id, device) where state = 'joined';
-- One call on at a time in a conversation: two people starting one at once get the same call.
create unique index calls_group_live on calls (conversation_id) where is_group and state <> 'ended';
