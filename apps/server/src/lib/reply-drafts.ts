/**
 * What became of a reply Cai drafted (M17 I11b), the number I11 is held to: each draft is kept
 * here for a quarter of an hour per person and conversation, in memory alone, and the next text
 * they send there settles it, as sent as drafted or as edited (half its words still there); a
 * draft never settled was put aside, which `caime_reply_drafts_total` reads as drafted less the
 * other two. Per instance: a send that lands on another instance than its draft counts as
 * neither.
 */
import { foldForFind } from '@caime/core/fold';
import type { AppContext } from '../context';
import { TtlCache } from './ttl-cache';

const DRAFT_STANDS_MS = 15 * 60_000;
/** Of a draft's words, the share still in what was sent for it to count as edited. */
const KEPT_SHARE = 0.5;

const drafts = new TtlCache<string, { exact: string; words: Set<string> }>(5_000, DRAFT_STANDS_MS);

const wordsOf = (text: string) =>
  new Set(
    foldForFind(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  );

export function noteDraft(
  ctx: AppContext,
  userId: string,
  conversationId: string,
  text: string,
): void {
  drafts.set(
    `${userId}:${conversationId}`,
    { exact: text.trim(), words: wordsOf(text) },
    ctx.now().getTime(),
  );
  ctx.metrics.replyDrafts.inc({ outcome: 'drafted' });
}

/** The person's next text in the conversation, against the draft they were given there. */
export function settleDraft(
  ctx: AppContext,
  userId: string,
  conversationId: string,
  body: string | null,
): void {
  const key = `${userId}:${conversationId}`;
  const draft = drafts.get(key, ctx.now().getTime());
  if (!draft) return;
  drafts.delete(key);
  const text = body?.trim() ?? '';
  if (text === draft.exact) {
    ctx.metrics.replyDrafts.inc({ outcome: 'sent' });
    return;
  }
  const sent = wordsOf(text);
  let kept = 0;
  for (const w of draft.words) if (sent.has(w)) kept++;
  if (draft.words.size > 0 && kept / draft.words.size >= KEPT_SHARE)
    ctx.metrics.replyDrafts.inc({ outcome: 'edited' });
}
