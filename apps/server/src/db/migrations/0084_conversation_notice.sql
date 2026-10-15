-- R75 phase 2: a notice (bulk or no-reply mail) lands in a conversation of its own per sender,
-- never a request and never answered. Expand only: a column with its default.
alter table conversations add column notice boolean not null default false;
