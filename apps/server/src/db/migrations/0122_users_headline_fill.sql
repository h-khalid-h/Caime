-- no-transaction
-- Fills `users.headline` from each person's default identity (0121), a batch at a time, outside
-- a transaction so each batch commits on its own (CLAUDE.md, convention 7). It fills only an
-- empty headline, so a run cut short is run again whole.
call fill_users_headline();
