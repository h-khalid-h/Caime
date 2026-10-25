-- Cai's answers said aloud in its chat (M17 I14a): the sound is a file of Cai's own, counted on
-- nobody's storage, so it's kept for a while and then let go, the answer staying as its words.
-- A row a sound: its file (gone with it), the message it was said in (null once that message is
-- gone, which lets the file go at once), and when. Expand only: a new table.
create table if not exists cai_spoken (
  file_id uuid primary key references files (id) on delete cascade,
  message_id uuid references messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cai_spoken_message on cai_spoken (message_id);
create index if not exists cai_spoken_created on cai_spoken (created_at);
