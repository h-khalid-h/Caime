-- Possible duplicates (PRD §51): two of someone's connections they've said are the same person
-- (two accounts of one Sarah). Only in their own view: the merged one shows under the one it's
-- merged into, and both accounts, and their conversations, stay as they are.
alter table connection_sides add column merged_into uuid references users (id) on delete set null;
