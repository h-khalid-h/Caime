-- no-transaction
-- What was said in a call, found by Search and its answers as messages are (M17 I12a): a heard
-- line's words folded (`caime_find_text`, M17 I5), read only by whoever was in the call from when
-- they joined, as the notes are.
create index concurrently if not exists call_note_lines_search_fold on call_note_lines
  using gin (to_tsvector('simple', caime_find_text(coalesce(body, ''))));
