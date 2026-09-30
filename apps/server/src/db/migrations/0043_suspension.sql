-- An account suspended by the operator (R49): kept whole, but with every way in closed until
-- the suspension is lifted. The reason is the operator's note to themselves.
alter table users add column suspended_at timestamptz;
alter table users add column suspended_reason text;
