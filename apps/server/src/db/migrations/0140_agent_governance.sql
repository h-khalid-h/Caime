-- What an organization lets its AI agent do, and when (M16 G6a, review 2026-10-17 §7: "no on/off
-- per action, no office hours"): offer and book open times, take orders from the menu, and
-- answer always or only while the organization is closed by its hours. Each on, and always, by
-- default: what the agent has done until now.
alter table org_agents add column if not exists may_book boolean not null default true;
alter table org_agents add column if not exists may_order boolean not null default true;
alter table org_agents add column if not exists answers_when text not null default 'always'
  check (answers_when in ('always', 'closed'));

-- Which version of a feature's instructions answered a model call: a short hash of their text,
-- so a change in what the model was told is visible beside what it did (review §11, governed AI).
alter table ai_runs add column if not exists prompt_hash text;
