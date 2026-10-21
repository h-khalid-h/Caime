-- Cai's notes of a call, written once it's over (M16 F7e, R112): what it was about, its topics,
-- what was decided and the next steps by person, for whoever was in it for all of it (R85 (2)).
-- One row a call, gone with the call's line as its notes are. Expand only: a new table.
create table if not exists call_note_summaries (
  call_id uuid primary key references calls (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  -- The call's line in its conversation: the notes go with it, erased with it.
  message_id uuid references messages (id) on delete cascade,
  state text not null check (state in ('writing', 'written', 'none')),
  summary jsonb,
  written_at timestamptz,
  -- When they were last asked for: only the job asked for last writes them, so words deleted one
  -- after another are written up once.
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists call_note_summaries_conversation
  on call_note_summaries (conversation_id);
create index if not exists call_note_summaries_message on call_note_summaries (message_id);
