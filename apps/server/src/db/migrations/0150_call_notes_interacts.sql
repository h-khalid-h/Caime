-- Interact (R114 (3), M17 I13g): the third mode, "Answer, Cai joins in". Asked with the notes as
-- Record is: Cai, called by name, answers aloud from what the call shares; its introduction aloud
-- once as it joins (introduced_at). What it said, as sound for the recorder's browser to play
-- into the call and as the window a microphone's echo is dropped in: a row an utterance, its
-- sound kept an hour. Expand only: two columns with defaults, a table with its indexes.
alter table call_notes add column if not exists interacts boolean not null default false;
alter table call_notes add column if not exists introduced_at timestamptz;

create table if not exists call_cai_utterances (
  id uuid primary key,
  call_id uuid not null references calls (id) on delete cascade,
  notes_id uuid not null references call_notes (id) on delete cascade,
  text text not null,
  storage_key text,
  mime text not null default 'audio/mpeg',
  spoken_from timestamptz not null,
  spoken_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists call_cai_utterances_call on call_cai_utterances (call_id, spoken_from);
create index if not exists call_cai_utterances_notes on call_cai_utterances (notes_id);
create index if not exists call_cai_utterances_created on call_cai_utterances (created_at);
