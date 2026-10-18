-- Every foreign key leads an index (M16 D2a, review 2026-10-17 §6 M: "~40 user foreign keys
-- unindexed"): deleting an account, erasing a conversation or removing a connection made
-- Postgres scan each table that points at the row, whole, to null or delete what pointed at
-- it (messages.pinned_by on every account deletion). The small tables are here; the ones that
-- grow with use are built concurrently, a file each (0108 on). Partial where the column is
-- mostly null. `fk-indexes.test.ts` holds every foreign key to one. And the procedure 0104 made
-- is done with: 0106 ran it again.
create index if not exists album_photos_added_by on album_photos (added_by) where added_by is not null;
create index if not exists business_threads_customer on business_threads (customer_id) where customer_id is not null;
create index if not exists business_threads_escalated_by on business_threads (escalated_by) where escalated_by is not null;
create index if not exists business_threads_resolved_by on business_threads (resolved_by) where resolved_by is not null;
create index if not exists connection_requests_from_identity on connection_requests (from_identity_id) where from_identity_id is not null;
create index if not exists connection_sides_identity on connection_sides (identity_id) where identity_id is not null;
create index if not exists connection_sides_merged_into on connection_sides (merged_into) where merged_into is not null;
create index if not exists connection_sides_other on connection_sides (other_id);
create index if not exists connections_user_b on connections (user_b);
create index if not exists contexts_created_by on contexts (created_by) where created_by is not null;
create index if not exists decisions_context on decisions (context_id) where context_id is not null;
create index if not exists decisions_decided_by on decisions (decided_by) where decided_by is not null;
create index if not exists decisions_recorded_by on decisions (recorded_by) where recorded_by is not null;
create index if not exists e2ee_devices_introduced_by on e2ee_devices (introduced_by) where introduced_by is not null;
create index if not exists hidden_messages_message on hidden_messages (message_id);
create index if not exists meeting_guests_invited_by on meeting_guests (invited_by) where invited_by is not null;
create index if not exists meeting_spaces_created_by on meeting_spaces (created_by) where created_by is not null;
create index if not exists oauth_codes_grant on oauth_codes (grant_id);
create index if not exists org_agents_bot_user on org_agents (bot_user_id);
create index if not exists org_agents_created_by on org_agents (created_by) where created_by is not null;
create index if not exists org_apps_bot_user on org_apps (bot_user_id) where bot_user_id is not null;
create index if not exists org_apps_created_by on org_apps (created_by) where created_by is not null;
create index if not exists org_invites_created_by on org_invites (created_by) where created_by is not null;
create index if not exists org_members_added_by on org_members (added_by) where added_by is not null;
create index if not exists org_reclaims_user on org_reclaims (user_id);
create index if not exists org_updates_posted_by on org_updates (posted_by) where posted_by is not null;
create index if not exists organizations_avatar_file on organizations (avatar_file_id) where avatar_file_id is not null;
create index if not exists organizations_created_by on organizations (created_by) where created_by is not null;
create index if not exists organizations_reclaim_by on organizations (reclaim_by) where reclaim_by is not null;
create index if not exists organizations_succeeded_by on organizations (succeeded_by) where succeeded_by is not null;
create index if not exists poll_votes_user on poll_votes (user_id);
create index if not exists push_subscriptions_session on push_subscriptions (session_id) where session_id is not null;
create index if not exists relationship_policies_scope_connection on relationship_policies (scope_connection_id) where scope_connection_id is not null;
create index if not exists relationships_connection on relationships (connection_id) where connection_id is not null;
create index if not exists relationships_superseded_by on relationships (superseded_by) where superseded_by is not null;
create index if not exists report_evidence_sender on report_evidence (sender_id) where sender_id is not null;
create index if not exists reports_reporter on reports (reporter_id) where reporter_id is not null;
create index if not exists reports_target_user on reports (target_user_id) where target_user_id is not null;
create index if not exists space_members_added_by on space_members (added_by) where added_by is not null;
create index if not exists spaces_created_by on spaces (created_by) where created_by is not null;
drop procedure if exists fill_participants_last_sent();
