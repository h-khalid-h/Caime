-- Cai records a call (R114, M17 I13b): the Record mode of a call's notes keeps what's said and
-- what's shown on a shared screen as a recording, beside the notes. One member's browser records,
-- as it does the notes (R85 (4)): the voices of everyone who said yes, mixed, as one part, and
-- each screen shown as a part of its own; each part is sent in pieces during the call, made
-- seekable when it ends, and played by whoever was in the call when it began (R85 (2)). Expand
-- only: a column with a default, two nullable ones and a new table.
alter table call_notes add column if not exists records boolean not null default false;
-- When the recording goes (R114 (6)): thirty days from its start, or an organization's shorter
-- retention; deleted for everyone by anyone in it, the notes staying.
alter table call_notes add column if not exists recording_until timestamptz;
alter table call_notes add column if not exists recording_deleted_at timestamptz;

create table if not exists call_recording_parts (
  id uuid primary key,
  notes_id uuid not null references call_notes (id) on delete cascade,
  call_id uuid not null references calls (id) on delete cascade,
  -- The voices of everyone who said yes, mixed, or one screen as it was shown.
  kind text not null check (kind in ('voices', 'screen')),
  -- Whose screen a screen part is.
  shown_by uuid references users (id) on delete set null,
  -- The browser that records it: a member's, never a guest's (R85 (4)).
  recorder_id uuid references users (id) on delete set null,
  recorder_device text not null,
  -- Where its pieces are appended while it's recorded (a `tmp/` key), then where it's kept.
  storage_key text not null,
  mime text not null,
  bytes bigint not null default 0,
  -- When it began on the recording device's clock, held to the server's: parts play in step.
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms integer,
  state text not null default 'recording'
    check (state in ('recording', 'finishing', 'ready', 'failed', 'deleted')),
  last_piece_at timestamptz,
  -- On the server's clock: who joined after it began never plays it (R85 (2)).
  created_at timestamptz not null default now()
);
create index if not exists call_recording_parts_notes on call_recording_parts (notes_id, started_at);
create index if not exists call_recording_parts_call on call_recording_parts (call_id);
create index if not exists call_recording_parts_shown_by on call_recording_parts (shown_by);
create index if not exists call_recording_parts_recorder on call_recording_parts (recorder_id);
-- A recorder gone quiet leaves a part recording: the sweep finishes what it sent.
create index if not exists call_recording_parts_open on call_recording_parts (created_at)
  where state = 'recording';
-- Recordings past their day, for the daily sweep.
create index if not exists call_notes_recording_until on call_notes (recording_until)
  where records and recording_deleted_at is null;
