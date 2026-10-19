-- Links to someone's own files (M16 H6): the file's sender gives out a link that opens it for
-- anyone who has it, or only for someone signed in to Caime, for a day, a week or a month, until
-- it's taken back. The token is kept as its hash alone; a link counts how many times its page was
-- opened, never by whom. It goes with its file, its message or its maker. Expand only: a new table.
create table if not exists file_links (
  id uuid primary key,
  file_id uuid not null references files (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  created_by uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  audience text not null check (audience in ('anyone', 'caime')),
  opens integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists file_links_file on file_links (file_id);
create index if not exists file_links_message on file_links (message_id);
create index if not exists file_links_created_by on file_links (created_by, created_at desc);
