-- Cai answers for someone who turned it on (R116, M17 I16a, ADR-18): one row each time Cai
-- answers in a one-to-one for its receiver (a stranger's message request now; a contact who
-- waited on them later, I16a2), at most one live at a time in a conversation. It says where it
-- stands (offered its two choices; the message left; talking, on the payer's allowance; ended),
-- whose allowance a turn is spent from, how many turns there were, and the summary written to the
-- receiver. Cai is never a member of the conversation: its lines are messages marked
-- `payload.answering` (lib/cai-answers.ts).
create table cai_answering (
  id uuid primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  receiver_id uuid not null references users (id) on delete cascade,
  caller_id uuid not null references users (id) on delete cascade,
  state text not null check (state in ('offered', 'left', 'talking', 'ended')),
  -- Whether "Talk to Cai now" was offered (an adult with AI assist on), beside "Leave my message".
  talk boolean not null default false,
  payer_id uuid references users (id) on delete set null,
  turns integer not null default 0,
  -- The caller's first line of it: Cai reads the conversation from there on, never before.
  from_seq bigint not null,
  offered_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by text check (ended_by in ('caller', 'receiver', 'declined', 'limit', 'handed_over')),
  summary_message_id uuid references messages (id) on delete set null
);

-- One live at a time in a conversation; the latest found first. Every foreign key leads an index
-- (fk-indexes.test.ts).
create unique index cai_answering_live on cai_answering (conversation_id)
  where state in ('offered', 'talking');
create index cai_answering_conversation on cai_answering (conversation_id, offered_at desc);
create index cai_answering_receiver on cai_answering (receiver_id);
create index cai_answering_caller on cai_answering (caller_id);
create index cai_answering_payer on cai_answering (payer_id);
create index cai_answering_summary on cai_answering (summary_message_id);
