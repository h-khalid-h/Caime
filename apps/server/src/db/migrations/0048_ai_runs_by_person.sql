-- The AI allowance counts a person's runs in the last day (lib/plans.ts aiUsage): one index
-- answers it, instead of a pass over the day's runs of everyone.
create index if not exists ai_runs_user_created on ai_runs (user_id, created_at);
