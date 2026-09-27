/**
 * Possible duplicates (PRD §51): two of someone's connections who may be the same person (two
 * accounts of one Sarah). Offered as a suggestion, never done for them (R12), and only from
 * what they can see themselves: the names each shows them, their own nicknames and their own
 * labels. Nothing they can't see (an email, a phone number) ever links two accounts: someone
 * may keep a separate account on purpose.
 */
import type { AppContext } from '../context';
import { personViewsFor } from './people-batch';
import { createSuggestion } from './suggest';

/** Below this, it's never offered. */
const OFFER_AT = 0.65;

/** A name's words, the way two spellings of it compare: no case, accents or punctuation. */
export function nameWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

interface Seen {
  id: string;
  name: string;
  nickname: string | null;
  labels: Array<{ sphere: string; orgName: string | null }>;
}

/** How likely two people someone knows are one, and why, in their words. */
export function sameness(a: Seen, b: Seen): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0;
  const wa = nameWords(a.name);
  const wb = nameWords(b.name);
  const same = wa.length > 0 && wa.join(' ') === wb.join(' ');
  if (same && wa.length > 1) {
    confidence += 0.8;
    reasons.push('the same name');
  } else if (same) {
    // One word ("Sam") is many people's name.
    confidence += 0.5;
    reasons.push('the same name');
  } else {
    const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    if (short.length && short[0] === long[0] && short.every((w) => long.includes(w))) {
      confidence += 0.4;
      reasons.push('one name is part of the other');
    }
  }
  const na = a.nickname?.trim().toLowerCase();
  if (na && na === b.nickname?.trim().toLowerCase()) {
    confidence += 0.8;
    reasons.push('the same nickname');
  }
  const place = (l: { orgName: string | null }) => l.orgName?.trim().toLowerCase() || null;
  const shared = a.labels.find((x) => place(x) && b.labels.some((y) => place(y) === place(x)));
  if (shared && confidence > 0) {
    confidence += 0.3;
    reasons.push(`you know both from ${shared.orgName}`);
  }
  return { confidence: Math.min(1, confidence), reasons };
}

/**
 * After someone connects, or changes how they name or label a person: is that person (`subjectId`)
 * perhaps one of theirs already? Each pair is offered once; "Keep separate" is remembered.
 */
export async function suggestDuplicatesOf(
  ctx: AppContext,
  ownerId: string,
  subjectId: string,
): Promise<void> {
  const sides = await ctx.db
    .selectFrom('connection_sides as s')
    .innerJoin('connections as c', 'c.id', 's.connection_id')
    .innerJoin('users as u', 'u.id', 's.other_id')
    .select(['s.other_id', 's.nickname', 's.merged_into', 's.created_at'])
    .where('s.owner_id', '=', ownerId)
    .where('c.status', '=', 'active')
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .orderBy('s.created_at')
    .limit(1000)
    .execute();
  // Someone already shown under another of theirs is offered as that one, never on their own.
  const theirs = new Set(sides.map((s) => s.other_id));
  const under = (s: { merged_into: string | null }) =>
    Boolean(s.merged_into && theirs.has(s.merged_into));
  const subject = sides.find((s) => s.other_id === subjectId);
  if (!subject || under(subject)) return;
  const others = sides.filter((s) => s.other_id !== subjectId && !under(s));
  if (!others.length) return;
  const ids = [subjectId, ...others.map((s) => s.other_id)];
  const [views, labels, blocks] = await Promise.all([
    personViewsFor(ctx, ownerId, ids),
    ctx.db
      .selectFrom('relationships')
      .select(['subject_id', 'sphere', 'org_name'])
      .where('owner_id', '=', ownerId)
      .where('subject_id', 'in', ids)
      .where('status', '=', 'active')
      .execute(),
    ctx.db
      .selectFrom('blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', ownerId), eb('blocked_id', 'in', ids)]),
          eb.and([eb('blocked_id', '=', ownerId), eb('blocker_id', 'in', ids)]),
        ]),
      )
      .execute(),
  ]);
  const blocked = new Set(
    blocks.map((b) => (b.blocker_id === ownerId ? b.blocked_id : b.blocker_id)),
  );
  const seen = (s: (typeof sides)[number]): (Seen & { at: Date }) | null => {
    const v = views.get(s.other_id);
    // Someone blocked either way isn't offered as anyone's duplicate.
    if (!v || blocked.has(s.other_id)) return null;
    return {
      id: s.other_id,
      at: s.created_at,
      name: v.displayName,
      nickname: s.nickname,
      labels: labels
        .filter((l) => l.subject_id === s.other_id)
        .map((l) => ({ sphere: l.sphere, orgName: l.org_name })),
    };
  };
  const a = seen(subject);
  if (!a) return;
  for (const other of others) {
    const b = seen(other);
    if (!b) continue;
    const { confidence, reasons } = sameness(a, b);
    if (confidence < OFFER_AT) continue;
    // Kept under the one they've known longer.
    const [keep, merge] = b.at <= a.at ? [b, a] : [a, b];
    const [x, y] = [a.id, b.id].sort();
    await createSuggestion(ctx, {
      userId: ownerId,
      kind: 'duplicate',
      title:
        merge.name === keep.name
          ? `${keep.name} may have two accounts`
          : `${merge.name} and ${keep.name} may be the same person`,
      rationale: `Both have ${reasons.join(', and ')}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.`,
      confidence,
      payload: { keep: keep.id, merge: merge.id },
      subjectUserId: merge.id,
      fingerprint: `duplicate:${x}:${y}`,
    });
  }
}
