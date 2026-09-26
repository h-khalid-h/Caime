-- Deleting an account (modules/account.ts) keeps other people's actions that were waiting on
-- it: the task stays on its owner's list, assigned to nobody, instead of vanishing with the
-- account. Tasks the account owned still go with it.

alter table tasks alter column assignee_id drop not null;
alter table tasks drop constraint tasks_assignee_id_fkey;
alter table tasks
  add constraint tasks_assignee_id_fkey
  foreign key (assignee_id) references users (id) on delete set null;
