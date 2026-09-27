-- The name people see follows a rename in Profile (modules/me.ts): the personal identity is the
-- profile's own name, and until now a rename left it as it was at sign-up, so everyone else kept
-- seeing the old name. The app gives no identity a name of its own.
update identities i
set display_name = u.display_name
from users u
where i.user_id = u.id and i.kind = 'personal' and i.is_default
  and i.display_name <> u.display_name;

-- A message deleted for everyone, or disappeared, takes the notifications about it with it
-- (lib/notify.ts forgetNotificationsOf): those showing its words, which a burst can keep from an
-- earlier message than the one it points at, and those that point at it.
alter table notifications add column quotes uuid[] not null default '{}';
create index notifications_quotes on notifications using gin (quotes);
create index notifications_message on notifications ((data->>'messageId'));

-- A disappearing message goes when its own time is up: the conversation's setting when it was
-- sent (lib/messages.ts), as people are told. Until now it went by the setting as it was each
-- hour, so turning it off kept what was sent under it, and turning it on in an old conversation
-- emptied years of both people's messages within the hour. Those already sent go as they would
-- have.
alter table messages add column expires_at timestamptz;
update messages m
set expires_at = m.created_at + make_interval(days => c.retention_days)
from conversations c
where m.conversation_id = c.id and c.retention_days is not null and m.deleted_at is null;
create index messages_expiring on messages (expires_at)
  where expires_at is not null and deleted_at is null;

-- What Caishy records of how it's used goes when its time is up (lib/retention.ts), found by
-- when it was written. The log of what people do goes after 30 days and what of it names nobody
-- (the measures, lib/retention.ts MEASURES) after 400, so each has its own index: neither sweep
-- reads past what the other keeps. An AI run names nobody after 30 days, and goes after 400.
create index audit_log_created on audit_log (created_at);
create index domain_events_activity on domain_events (created_at)
  where type not in ('attention.answered', 'attention.dismissed', 'search.outcome');
create index domain_events_measures on domain_events (created_at)
  where type in ('attention.answered', 'attention.dismissed', 'search.outcome');
create index ai_runs_named on ai_runs (created_at)
  where user_id is not null or conversation_id is not null;
create index ai_runs_created on ai_runs (created_at);
create index webhook_deliveries_created on webhook_deliveries (created_at);
