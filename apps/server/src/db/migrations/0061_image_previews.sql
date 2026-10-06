-- An image drawn large gets a preview sized for dense screens (R70), beside its thumbnail; an
-- older image gets one from the backfill job. The partial index finds what still needs one.
alter table files add column preview_key text;
create index files_preview_missing on files (id) where preview_key is null and thumb_key is not null;
