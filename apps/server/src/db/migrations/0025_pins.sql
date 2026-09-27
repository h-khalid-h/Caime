-- Pinned messages (PRD §22, §56): a few messages a conversation keeps at its top, the same for
-- everyone in it. Who pinned one is kept for the line that says so; deleting a message, or its
-- disappearing, unpins it.
alter table messages
  add column pinned_at timestamptz,
  add column pinned_by uuid references users (id) on delete set null;
create index messages_pinned on messages (conversation_id, pinned_at desc) where pinned_at is not null;
