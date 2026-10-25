-- A call's recording kept past its day (R114 (6), M17 I13d): whoever asked Cai to record it may
-- keep it, and then its bytes count against their storage until they let it go or delete it;
-- a kept recording is left alone by the daily sweep. Expand only: two nullable columns and the
-- index the foreign key leads (a keeper's account going frees what they kept).
alter table call_notes add column if not exists kept_by uuid references users(id) on delete set null;
alter table call_notes add column if not exists kept_at timestamptz;
create index if not exists call_notes_kept_by on call_notes (kept_by) where kept_by is not null;
