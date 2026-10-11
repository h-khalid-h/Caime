-- R78: the audit log as a hash chain, sealed as each row's transaction commits, and what an app
-- gives Caime (`provides`) on its listing.

-- The canonical form of a row, in the database beside the rows: each row's hash covers its own
-- fields and the hash of the row before it in the chain, so a row changed, taken out of the
-- middle or put in reads as a break. The trigger, the verifier (lib/audit.ts) and the backfill
-- below all call this one function; a change to the form is a new function and a new chain.
create function audit_hash(
  prev text,
  actor_id uuid,
  action text,
  target text,
  ip inet,
  user_agent text,
  metadata jsonb,
  created_at timestamptz
) returns text language sql stable as $$
  select encode(sha256(convert_to(concat_ws(E'\n',
    coalesce(prev, ''),
    coalesce(actor_id::text, ''),
    action,
    coalesce(target, ''),
    coalesce(host(ip), ''),
    coalesce(user_agent, ''),
    metadata::text,
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'utf8')), 'hex')
$$;

-- `seq` is the chain's order, given as the row is sealed; `prev_hash` is the hash of the row
-- sealed before it (null for the first ever), `hash` its own.
alter table audit_log
  add column seq bigint,
  add column prev_hash text,
  add column hash text;
create sequence audit_log_seq;

-- What's there joins the chain in the order it was written.
do $$
declare
  r record;
  before text := null;
  own text := null;
  n bigint := 0;
begin
  for r in select * from audit_log order by id loop
    n := n + 1;
    own := audit_hash(before, r.actor_id, r.action, r.target, r.ip, r.user_agent, r.metadata, r.created_at);
    update audit_log set seq = n, prev_hash = before, hash = own where id = r.id;
    before := own;
  end loop;
  perform setval('audit_log_seq', greatest(n, 1), n > 0);
end
$$;

create unique index audit_log_seq_key on audit_log (seq);

-- Sealing happens when the transaction commits (a deferred constraint trigger), under one lock
-- held for that moment alone: taken after every other lock the transaction holds, it can't wait
-- on one that waits on it, and a transaction that rolls back seals nothing. Nothing inserts past
-- it, so every committed row is in the chain.
create function audit_log_seal() returns trigger language plpgsql as $$
declare
  before text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log'));
  select hash into before from audit_log where seq is not null order by seq desc limit 1;
  update audit_log
    set seq = nextval('audit_log_seq'),
        prev_hash = before,
        hash = audit_hash(before, actor_id, action, target, ip, user_agent, metadata, created_at)
    where id = new.id;
  return null;
end
$$;

create constraint trigger audit_log_chain
  after insert on audit_log
  deferrable initially deferred
  for each row execute function audit_log_seal();

-- What an app says it gives Caime (R78): a closed list, reviewed as the listing is.
alter table oauth_clients add column provides text[] not null default '{}';
