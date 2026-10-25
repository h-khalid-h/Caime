-- What was on a shared screen (R114 (1) and (4), M17 I13h): while Cai records, the recording's
-- browser keeps a frame of each screen shown at each change of it, beside the screen's part, and
-- the write-up reads up to eight of them once (`read`), as lines from the screen. A frame goes
-- with its part, the recording and the call's line. Expand only: a new table with its indexes.
create table if not exists call_recording_frames (
  id uuid primary key,
  part_id uuid not null references call_recording_parts (id) on delete cascade,
  notes_id uuid not null references call_notes (id) on delete cascade,
  call_id uuid not null references calls (id) on delete cascade,
  at_ms integer not null,
  storage_key text not null,
  bytes integer not null default 0,
  width integer not null,
  height integer not null,
  read text,
  created_at timestamptz not null default now()
);
create index if not exists call_recording_frames_part on call_recording_frames (part_id, at_ms);
create index if not exists call_recording_frames_notes on call_recording_frames (notes_id);
create index if not exists call_recording_frames_call on call_recording_frames (call_id, at_ms);
