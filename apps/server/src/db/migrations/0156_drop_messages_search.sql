-- contracts after 7b975b09a7f59efaab752050fb4a702f042a71d7
-- The first search column (0001) has been read by nothing since 0065 (`search_all`), and every
-- message written paid for its vector and its index: both go. Dropping a generated column is a
-- change to the catalog alone, no rewrite.
drop index if exists messages_search;
alter table messages drop column if exists search;
