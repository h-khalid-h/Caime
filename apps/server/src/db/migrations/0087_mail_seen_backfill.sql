-- Mail sent before replies said "seen" (R75, migration 0086): a mail out that its address later
-- answered was seen, at the first answer's time.
update mail_messages o
set seen_at = (
  select min(i.created_at)
  from mail_messages i
  where i.direction = 'in'
    and i.from_address = o.to_address
    and i.to_address = o.from_address
    and i.created_at > o.created_at
)
where o.direction = 'out'
  and o.seen_at is null
  and exists (
    select 1
    from mail_messages i
    where i.direction = 'in'
      and i.from_address = o.to_address
      and i.to_address = o.from_address
      and i.created_at > o.created_at
  );
