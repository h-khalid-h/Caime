-- Call history (PRD §47): each person's calls that are over, newest first, found without reading
-- everyone's (the live-call indexes cover only calls still on).
create index calls_caller_history on calls (caller_id, id desc) where not is_group and state = 'ended';
create index calls_callee_history on calls (callee_id, id desc) where not is_group and state = 'ended';
create index call_members_user on call_members (user_id, call_id);
