-- The AI agent's model calls, by conversation: what one customer can make it do in a day is
-- bounded by the calls it makes, answered or not, not only by what it posts (lib/agent.ts).
alter table ai_runs add column conversation_id uuid;
create index ai_runs_conversation on ai_runs (conversation_id, created_at)
  where conversation_id is not null;

-- Each side of a call says it's still there for itself, so one side staying can't keep open a
-- call the other has left (lib/calls.ts). seen_at stays: the last time either side was there.
alter table calls add column caller_seen_at timestamptz not null default now();
alter table calls add column callee_seen_at timestamptz;
update calls
set caller_seen_at = seen_at,
    callee_seen_at = case when answered_at is not null then seen_at end;
