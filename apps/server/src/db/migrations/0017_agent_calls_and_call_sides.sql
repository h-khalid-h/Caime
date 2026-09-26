-- The AI agent's model calls, by conversation: what one customer can make it do in a day is
-- bounded by the calls it makes, answered or not, not only by what it posts (lib/agent.ts).
alter table ai_runs add column conversation_id uuid;
create index ai_runs_conversation on ai_runs (conversation_id, created_at)
  where conversation_id is not null;
-- An answer it thought of but never sent (the customer wrote again meanwhile): the call still
-- happened, and how it ended stays in outcome; no plan counts it.
alter table ai_runs add column discarded_at timestamptz;

-- Each side of a call says it's still there for itself, so one side staying can't keep open a
-- call the other has left (lib/calls.ts). seen_at stays: the last time either side was there.
alter table calls add column caller_seen_at timestamptz not null default now();
alter table calls add column callee_seen_at timestamptz;
update calls
set caller_seen_at = seen_at,
    callee_seen_at = case when answered_at is not null then seen_at end;

-- Whether the person called was rung: not when they're on another call and the caller may not
-- see they're online. To the caller it rings like any call; to them it's a missed call.
alter table calls add column callee_rung boolean not null default true;
