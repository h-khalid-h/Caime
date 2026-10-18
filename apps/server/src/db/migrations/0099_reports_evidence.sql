-- Reports that hold up (M16 B3): what someone reported, as they saw it then, kept with the report
-- whatever its sender deletes since (the reported message and up to four before it, each with
-- its sender's name then; an update's words), and gone with the report; a report closes
-- (`closed_at`) when it's actioned or dismissed, and the daily sweep deletes it after its time.
alter table reports add column closed_at timestamptz;
update reports set closed_at = created_at where status in ('actioned', 'dismissed');
create index reports_closed on reports (closed_at) where closed_at is not null;

create table report_evidence (
  report_id uuid not null references reports (id) on delete cascade,
  position smallint not null,
  message_id uuid,
  sender_id uuid references users (id) on delete set null,
  sender_name text,
  kind text not null,
  body text,
  sent_at timestamptz not null,
  reported boolean not null default false,
  -- Brought over from another app (R45): what the importer's file said, never the sender's own.
  imported boolean not null default false,
  primary key (report_id, position)
);

-- An organization suspended by the operator (M16 B3): its page and handle answer as nobody's,
-- nothing is written as it or to it, its apps' tokens are refused; lifted, all of it comes back.
alter table organizations add column suspended_at timestamptz, add column suspended_reason text;
