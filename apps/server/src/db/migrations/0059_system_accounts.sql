-- Caime's own accounts (R67): Cai, the assistant anyone can chat with, and the seven Caime
-- Friends. Their ids are fixed (core system-accounts.ts). They never sign in ('!'), are found by
-- their handles alone and take no message requests: a conversation with one is opened by its own
-- route, and only ever by the person. A handle somebody already holds is left to them.
alter table users drop constraint users_kind_check;
alter table users add constraint users_kind_check
  check (kind in ('human', 'bot', 'agent', 'assistant', 'character'));

insert into users (id, email, handle, password_hash, display_name, kind, privacy, onboarded_at)
values
  ('00000000-0000-4000-8000-00000000ca10', 'cai@system.caime.invalid', 'cai', '!', 'Cai', 'assistant', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca11', 'caishy@system.caime.invalid', 'caishy', '!', 'Caishy', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca12', 'momo@system.caime.invalid', 'momo', '!', 'Momo', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca13', 'panda@system.caime.invalid', 'panda', '!', 'Panda', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca14', 'lumi@system.caime.invalid', 'lumi', '!', 'Lumi', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca15', 'pico@system.caime.invalid', 'pico', '!', 'Pico', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca16', 'niko@system.caime.invalid', 'niko', '!', 'Niko', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now()),
  ('00000000-0000-4000-8000-00000000ca17', 'zuzu@system.caime.invalid', 'zuzu', '!', 'Zuzu', 'character', '{"discoverByEmail": false, "messageRequests": "nobody"}', now())
on conflict do nothing;
