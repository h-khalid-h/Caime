-- no-transaction
-- The fill of 0105 once more (M16 D2a): while the release that added `last_sent_seq` started,
-- the one before it kept serving and wrote messages without it. Every instance writes it now,
-- so this pass leaves nothing behind; it only raises the column, a batch at a time.
call fill_participants_last_sent();
