-- Where each person last wrote in each conversation (M16 D1, review 2026-10-17 §4 H7). The
-- inbox asks, for every conversation it lists, what was asked of me since my last message, and
-- found "my last message" by walking the conversation's messages backwards: the whole of one I
-- never wrote in. Every path that inserts a message now writes it for its sender (a message, a
-- system line, an import); what's already there is filled by the next file, by the procedure
-- below, a thousand rows at a time, each batch committed. Raising it only, it can run again.
alter table participants add column if not exists last_sent_seq bigint not null default 0;

create or replace procedure fill_participants_last_sent()
language plpgsql
as $$
declare
  at_conversation uuid := '00000000-0000-0000-0000-000000000000';
  at_user uuid := '00000000-0000-0000-0000-000000000000';
  n integer;
begin
  loop
    with batch as (
      select conversation_id, user_id
        from participants
       where (conversation_id, user_id) > (at_conversation, at_user)
       order by conversation_id, user_id
       limit 1000
    ), sent as (
      select b.conversation_id, b.user_id,
             (select max(m.seq) from messages m
               where m.conversation_id = b.conversation_id and m.sender_id = b.user_id) as seq
        from batch b
    ), filled as (
      update participants p
         set last_sent_seq = s.seq
        from sent s
       where p.conversation_id = s.conversation_id and p.user_id = s.user_id
         and s.seq > p.last_sent_seq
      returning 1
    )
    select count(*)::int,
           (array_agg(conversation_id order by conversation_id desc, user_id desc))[1],
           (array_agg(user_id order by conversation_id desc, user_id desc))[1]
      into n, at_conversation, at_user
      from batch;
    commit;
    exit when n < 1000;
  end loop;
end
$$;
