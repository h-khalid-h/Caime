-- no-transaction
-- Actions found as messages are (M17 I5): their title and notes folded. `tasks.search` and
-- `tasks_search` (0001) are read by nothing once this release runs and go in a later one.
create index concurrently if not exists tasks_search_fold on tasks
  using gin (to_tsvector('simple', caime_find_text(coalesce(title, '') || ' ' || coalesce(notes, ''))));
