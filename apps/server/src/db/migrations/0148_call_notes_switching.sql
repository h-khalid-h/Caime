-- Another mode mid-call (R114, M17 I13b2): a change of mode asks everyone in the call again, the
-- mode under way going on until they all have. The ask is a row of its own beside the live one,
-- in a state the live index doesn't cover ('switching'); settled, it takes over ('on') and the
-- row it replaces stops with why 'replaced'. Expand only: two checks widened, a partial index.
alter table call_notes drop constraint if exists call_notes_state_check;
alter table call_notes add constraint call_notes_state_check
  check (state in ('asking', 'on', 'stopped', 'declined', 'switching'));
alter table call_notes drop constraint if exists call_notes_why_check;
alter table call_notes add constraint call_notes_why_check check (
  why in (
    'stopped', 'declined', 'joined_without', 'minor', 'ended', 'no_recorder', 'allowance', 'replaced'
  )
);
-- Asked beside a live row: a declined switch is never read as the notes themselves, and one that
-- took over is the notes from then on (the mark cleared as it does).
alter table call_notes add column if not exists switch boolean not null default false;
-- One switch asked at a time in a call.
create unique index if not exists call_notes_switching on call_notes (call_id)
  where state = 'switching';
