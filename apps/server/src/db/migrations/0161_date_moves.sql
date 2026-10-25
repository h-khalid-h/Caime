-- A date's history (R119 level 2, M17 I19d): each move of a meeting's or an appointment's time
-- and of an action's due, kept in the change's own transaction, never updated, gone with what
-- it's about. `replan` is the plan truly moving (another time suggested, a due changed);
-- `correction` a wrong value fixed (a card moved back to its own clock when the zone's rules
-- changed). What slipped is counted from `replan` alone.
create table if not exists date_moves (
  id uuid primary key,
  message_id uuid references messages (id) on delete cascade,
  task_id uuid references tasks (id) on delete cascade,
  field text not null check (field in ('start', 'due')),
  value_at timestamptz,
  previous_at timestamptz,
  value_on date,
  previous_on date,
  reason text not null check (reason in ('replan', 'correction')),
  source text not null check (source in ('person', 'rules')),
  by_id uuid references users (id) on delete set null,
  known_at timestamptz not null default now(),
  check (num_nonnulls(message_id, task_id) = 1)
);
create index if not exists date_moves_message on date_moves (message_id);
create index if not exists date_moves_task on date_moves (task_id);
create index if not exists date_moves_by on date_moves (by_id);
