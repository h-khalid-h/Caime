-- no-transaction
-- Fills `participants.last_sent_seq` for what's there (0104), a batch at a time, outside a
-- transaction so each batch commits on its own (CLAUDE.md, convention 7). It only raises the
-- column, so a run cut short is run again whole.
call fill_participants_last_sent();
