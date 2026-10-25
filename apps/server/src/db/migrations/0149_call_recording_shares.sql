-- A call's recording shared on (R114 (7), M17 I13e): anyone who was in the call shares it into a
-- conversation they're in, as a message of theirs that points at the recording and goes when it
-- does. The message carries the call it points at; this table finds every share of a call when
-- its recording goes (never an index on messages' payload: 0030). Expand only: a new table.
create table if not exists call_recording_shares (
  message_id uuid primary key references messages (id) on delete cascade,
  call_id uuid not null references calls (id) on delete cascade,
  shared_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists call_recording_shares_call on call_recording_shares (call_id);
create index if not exists call_recording_shares_shared_by on call_recording_shares (shared_by);
