-- no-transaction
-- Fills `tasks.due_on` for actions due on a day (0158), a batch at a time, outside a transaction
-- so each batch commits on its own (CLAUDE.md, convention 7). It fills only an empty day, so a run
-- cut short is run again whole.
call fill_tasks_due_on();
