-- Cai answers the people someone knows too (R116, M17 I16a2): why it answered (a stranger's
-- request, a message from one of their people left unanswered, or the receiver busy), whether the
-- receiver covers the talk from their own allowance, and when Cai let the receiver know at once
-- that it couldn't wait. Expand only: every row before it was a stranger's request, uncovered.
alter table cai_answering
  add column reason text not null default 'request'
    check (reason in ('request', 'unanswered', 'busy')),
  add column covered boolean not null default false,
  add column rang_at timestamptz;

-- The talks a receiver covered in thirty days, counted before Cai offers another.
create index cai_answering_covered on cai_answering (receiver_id, offered_at) where covered;
