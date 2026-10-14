-- An organization's closing as the DPA's section 12 says (lib/org-data.ts): its export stays open
-- to whoever owned it last for 30 days after it closed, then what was its alone is deleted and
-- `cleared_at` says when. An organization closed before this has no last owner to export it.
alter table organizations
  add column last_owner_id uuid references users (id) on delete set null,
  add column cleared_at timestamptz;

-- The daily sweep finds what's due by when it closed; a deleted account finds what it last owned.
create index organizations_to_clear on organizations (archived_at)
  where archived_at is not null and cleared_at is null;
create index organizations_last_owner on organizations (last_owner_id)
  where last_owner_id is not null;

-- Whether anything still points at a file (lib/files.ts `dropUnusedFiles`), by index: a link's
-- or a photo's asset (also what a file's deletion sets to null) and a group's picture.
create index assets_file on assets (file_id) where file_id is not null;
create index conversations_avatar_file on conversations (avatar_file_id)
  where avatar_file_id is not null;
