-- An organization's team can write to someone first (R14). Such a conversation is a message
-- request to its customer until they answer or accept it, and counts against the plan's starts.
alter table business_threads add column started_by_team boolean not null default false;
create index business_threads_team_starts on business_threads (org_id, created_at)
  where started_by_team;
