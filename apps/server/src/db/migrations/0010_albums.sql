-- Shared albums (PRD §41): an album card in a conversation, and the photos people add to it.
-- A photo is readable by the conversation the album is in, as any shared file is (files.ts).
create table album_photos (
  message_id uuid not null references messages (id) on delete cascade,
  file_id uuid not null references files (id) on delete cascade,
  added_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (message_id, file_id)
);
create index album_photos_file on album_photos (file_id);
