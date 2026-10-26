-- A reply Cai drafted for someone (M17 I11b), held until the `reply-drafts` sweep sees the next
-- text they sent in that conversation, so what became of it (`caime_reply_drafts_total`: sent as
-- drafted, edited, else put aside) is counted wherever the draft and the send were served. Never
-- its words: a keyed hash of the whole and of each word, and the conversation's seq it answered.
-- One a person and conversation, gone once settled, after a day unsettled, and with either.
create table if not exists reply_drafts (
  user_id uuid not null references users (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  after_seq bigint not null,
  exact_hash text not null,
  word_hashes text[] not null,
  drafted_at timestamptz not null,
  primary key (user_id, conversation_id)
);
create index if not exists reply_drafts_conversation on reply_drafts (conversation_id);
create index if not exists reply_drafts_drafted on reply_drafts (drafted_at);
