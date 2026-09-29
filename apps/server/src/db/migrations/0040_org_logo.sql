-- An organization's logo: one of the uploader's image files, shown wherever the organization is.
alter table organizations add column avatar_file_id uuid references files (id) on delete set null;
