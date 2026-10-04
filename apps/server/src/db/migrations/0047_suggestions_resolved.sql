-- What a person decided on suggestions of a kind, newest first (M11: what they take, Caime
-- offers more readily; what they pass on, more quietly). Read when a suggestion is made.
create index if not exists suggestions_resolved
  on suggestions (user_id, kind, resolved_at desc)
  where status in ('accepted', 'dismissed');
