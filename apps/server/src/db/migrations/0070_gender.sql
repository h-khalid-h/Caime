-- R81: how someone said Caime should refer to them, or nothing. Never inferred (R27): written
-- only by the person, from Settings · Profile.
alter table users add column gender text check (gender in ('woman', 'man', 'other'));
