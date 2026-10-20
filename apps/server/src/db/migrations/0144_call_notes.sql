-- Cai takes notes in a call (M16 F7, R82 phase 1 under R85): asked inside the call by someone in
-- it, on once everyone in the call has said yes, stopped by anyone's no at any time. One member's
-- browser records each person's voice on its own track and sends each utterance as it ends; the
-- speech provider hears it, its words are kept and its audio deleted (R85 (5)). Expand only: new
-- tables.
create table if not exists call_notes (
  id uuid primary key,
  call_id uuid not null references calls (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  -- Who asked, whose day's allowance pays for hearing it (R107).
  started_by uuid references users (id) on delete set null,
  state text not null check (state in ('asking', 'on', 'stopped', 'declined')),
  -- The browser that records while it's on: always a member's, never a guest's (R85 (4)).
  recorder_id uuid references users (id) on delete set null,
  recorder_device text,
  -- The call's line in its conversation, once the call has ended: the notes go with it.
  message_id uuid references messages (id) on delete cascade,
  asked_at timestamptz not null default now(),
  started_at timestamptz,
  stopped_at timestamptz,
  stopped_by uuid references users (id) on delete set null,
  why text check (
    why in ('stopped', 'declined', 'joined_without', 'minor', 'ended', 'no_recorder', 'allowance')
  ),
  created_at timestamptz not null default now()
);
-- One ask or one recording at a time in a call; a call may have several over its life.
create unique index if not exists call_notes_live on call_notes (call_id)
  where state in ('asking', 'on');
create index if not exists call_notes_call on call_notes (call_id);
create index if not exists call_notes_conversation on call_notes (conversation_id);
create index if not exists call_notes_started_by on call_notes (started_by);
create index if not exists call_notes_recorder on call_notes (recorder_id);
create index if not exists call_notes_message on call_notes (message_id);
create index if not exists call_notes_stopped_by on call_notes (stopped_by);

-- Each person's yes or no, on the device they said it on, and whether that device can record.
create table if not exists call_note_answers (
  notes_id uuid not null references call_notes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  answer text not null check (answer in ('yes', 'no')),
  device text,
  can_record boolean not null default false,
  at timestamptz not null default now(),
  primary key (notes_id, user_id)
);
create index if not exists call_note_answers_user on call_note_answers (user_id);

-- What was said, one utterance a row, by whom and when; its audio only until it's heard.
create table if not exists call_note_lines (
  id uuid primary key,
  notes_id uuid not null references call_notes (id) on delete cascade,
  speaker_id uuid not null references users (id) on delete cascade,
  spoken_at timestamptz not null,
  length_ms integer not null,
  file_id uuid references files (id) on delete set null,
  body text,
  language text,
  state text not null default 'waiting' check (state in ('waiting', 'heard', 'unheard')),
  created_at timestamptz not null default now()
);
create index if not exists call_note_lines_notes on call_note_lines (notes_id, spoken_at);
create index if not exists call_note_lines_speaker on call_note_lines (speaker_id);
create index if not exists call_note_lines_file on call_note_lines (file_id);
