-- Review 2026-10-17 §4 (block A3): a message's effects (who is told, what is suggested, the
-- webhooks, the mail out) ran only in the memory of the instance that took the send, so a crash
-- between the commit and the end of them lost them for good. Now the send writes when the sweep
-- may step in (`effects_at`, a grace ahead), the fast path clears it when the effects are done,
-- and `message.effects` replays whatever is still due (lib/message-effects.ts). Null for a
-- message whose effects are done, were never wanted (a series' next time, a system line, an
-- import) or came before this release.
alter table messages add column effects_at timestamptz;
