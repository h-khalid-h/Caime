-- The cards a calendar and "Coming up" read, found by kind alone. The index before read the
-- payload in its predicate, and a column an index's predicate reads blocks updating a row in
-- place: every change to any message's payload (a live location moving every few seconds, a
-- card moving, a vote) rewrote every index on messages. A message's kind never changes.
drop index if exists messages_calendar_cards;
create index messages_kit_cards on messages (conversation_id) where kind = 'kit' and deleted_at is null;
