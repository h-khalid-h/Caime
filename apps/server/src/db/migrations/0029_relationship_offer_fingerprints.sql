-- What someone may be to you is offered once per person and kind of relationship, however it
-- came to be offered: one fingerprint for all of them, with the organization's name in any case.
-- Offers made before were written two ways, so the same one could show twice or come back once
-- dismissed. Of the ones that are now the same, the one answered (dismissed, accepted, expired)
-- is kept, so what was said about it holds; otherwise the first.
with next as (
  select id, user_id, status, created_at,
    'relationship:' || subject_user_id::text || ':' || coalesce(payload->>'sphere', '') || ':' ||
      coalesce(payload->>'role', '') || ':' || lower(coalesce(payload->>'orgName', '')) as fp
  from suggestions
  where kind = 'relationship' and subject_user_id is not null
),
ranked as (
  select id, row_number() over (
    partition by user_id, fp order by (status = 'pending'), created_at, id
  ) as n
  from next
)
delete from suggestions where id in (select id from ranked where n > 1);

update suggestions
set fingerprint = 'relationship:' || subject_user_id::text || ':' ||
  coalesce(payload->>'sphere', '') || ':' || coalesce(payload->>'role', '') || ':' ||
  lower(coalesce(payload->>'orgName', ''))
where kind = 'relationship' and subject_user_id is not null;
