-- no-transaction
-- The folded index search reads (M17 I5): the words as `caime_find_text` writes them, over
-- `caime_search_text` (migration 0153), built concurrently so writes never wait for the scan.
-- `search_all` and `messages_search_all` (0065) are read by nothing once this release runs and
-- go in a later one.
create index concurrently if not exists messages_search_fold on messages
  using gin (to_tsvector('simple', caime_find_text(caime_search_text(body, payload))));
