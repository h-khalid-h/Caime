-- Cai keeps going (R68). A wait its owner hands to Cai: at its remind time Cai offers a follow-up
-- ready to send, and watches again after it's sent. What Cai learned from someone's choices can
-- be forgotten, a kind at a time or all of it: decisions before the time kept here (by kind, or
-- '*') no longer teach anything. Both expand only.
alter table tasks add column cai_follow_up boolean not null default false;
alter table users add column learning_reset jsonb not null default '{}'::jsonb;
