-- An action's due day as a day of its own (R119, M17 I19b, docs/TIME.md). An action due on a day
-- kept that day only as `due_at`, 09:00 of it on its owner's clock (`instantOf`), so its day was
-- read back through a zone: someone it was shared with far enough west read the day before, and
-- the day moved when its owner moved. `due_on` keeps the day itself, set whenever the due has no
-- time and null when it has one; `due_at` stays for order, reminders and when it's overdue. The
-- next file fills it, by the procedure below, a thousand actions at a time, each batch committed;
-- it fills only an empty one, so it can run again.
alter table tasks add column if not exists due_on date;

create or replace procedure fill_tasks_due_on()
language plpgsql
as $$
declare
  at_task uuid := '00000000-0000-0000-0000-000000000000';
  n integer;
begin
  loop
    with batch as (
      select t.id, (t.due_at at time zone coalesce(nullif(u.time_zone, ''), 'UTC'))::date as day
        from tasks t
        join users u on u.id = t.owner_id
       where t.id > at_task and t.due_at is not null and not t.due_has_time and t.due_on is null
       order by t.id
       limit 1000
    ), filled as (
      update tasks t
         set due_on = b.day
        from batch b
       where t.id = b.id and t.due_on is null
      returning 1
    )
    select count(*)::int, max(id::text)::uuid into n, at_task from batch;
    commit;
    exit when n < 1000;
  end loop;
end
$$;
