-- Groups run by someone (PRD §56). Before an owner handed a group on as they left, a group whose
-- owner went was left with nobody who could make admins, and someone who left kept the role they
-- had, which came back if they were added again. Nobody who has left runs anything; and each
-- group (and each of a space's own conversations) that has people in it but no owner gets one:
-- its admin who has been in it longest, else whoever has, never an app's bot (core nextOwner).
update participants set role = 'member' where left_at is not null and role in ('owner', 'admin');

with ownerless as (
  select c.id
  from conversations c
  where c.kind not in ('direct', 'business')
    and not c.is_general
    and not exists (
      select 1 from participants p
      where p.conversation_id = c.id and p.left_at is null and p.role = 'owner'
    )
),
heirs as (
  select distinct on (p.conversation_id) p.conversation_id, p.user_id
  from participants p
  join ownerless o on o.id = p.conversation_id
  join users u on u.id = p.user_id
  where p.left_at is null and u.kind = 'human' and p.role in ('admin', 'member')
  order by p.conversation_id, (p.role = 'admin') desc, p.joined_at, p.user_id
)
update participants p
set role = 'owner'
from heirs h
where p.conversation_id = h.conversation_id and p.user_id = h.user_id;
