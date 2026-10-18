-- A person's headline on their own row (M16 D4, review 2026-10-17 §10: "identities decided").
-- Identities, faces chosen per connection (PRD §35), had no screen in the app and cost every list
-- of people two reads; the privacy evaluator already decides what each relationship sees (R2), and
-- an organization is the face for work with customers (R15). What stays is the headline, the one
-- line about what someone does, shown by their Work details setting: it moves here from their
-- default identity. The next file fills it, by the procedure below, a thousand people at a time,
-- each batch committed; it fills only an empty one, so it can run again. The identities table is
-- read by nothing now but the export, and goes in a later release.
alter table users add column if not exists headline text;

create or replace procedure fill_users_headline()
language plpgsql
as $$
declare
  at_user uuid := '00000000-0000-0000-0000-000000000000';
  n integer;
begin
  loop
    with batch as (
      select user_id, headline
        from identities
       where is_default and headline is not null and user_id > at_user
       order by user_id
       limit 1000
    ), filled as (
      update users u
         set headline = b.headline
        from batch b
       where u.id = b.user_id and u.headline is null
      returning 1
    )
    select count(*)::int, max(user_id::text)::uuid into n, at_user from batch;
    commit;
    exit when n < 1000;
  end loop;
end
$$;
