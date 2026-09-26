-- Calls (PRD §47): 1:1 voice and video in a direct conversation. The server rings, relays how
-- the two devices reach each other, and keeps this record; the media goes between them.
create table calls (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  caller_id uuid references users (id) on delete set null,
  callee_id uuid references users (id) on delete set null,
  kind text not null check (kind in ('voice', 'video')),
  state text not null check (state in ('ringing', 'active', 'ended')),
  outcome text check (outcome in ('completed', 'missed', 'declined', 'cancelled', 'failed')),
  -- The device on each side that's in the call: signals pass only between these two.
  caller_device text not null,
  callee_device text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  -- Both sides say they're still there; a call nobody is in any more is ended.
  seen_at timestamptz not null default now()
);
create index calls_live_caller on calls (caller_id) where state <> 'ended';
create index calls_live_callee on calls (callee_id) where state <> 'ended';
create index calls_conversation on calls (conversation_id, created_at desc);
