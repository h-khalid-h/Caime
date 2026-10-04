/**
 * Possible duplicates (PRD §51): two of someone's connections who may be the same person (two
 * accounts of one Sarah). Offered as a suggestion, never done for them (R12), and only from
 * what they can see themselves: the names each shows them, their own nicknames and their own
 * labels. Nothing they can't see (an email, a phone number) ever links two accounts: someone
 * may keep a separate account on purpose.
 */

import { tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { asReader } from './i18n';
import { personViewsFor } from './people-batch';
import { createSuggestion } from './suggest';

type Q = Kysely<Database> | Transaction<Database>;

/** Below this, it's never offered. */
const OFFER_AT = 0.65;

/**
 * A name's words, the way two spellings of it compare: no case, Latin accents or punctuation.
 * Other scripts' marks (a Devanagari vowel sign, an Arabic shadda) are part of their letters:
 * 'प्रिया' is one word, and not 'प्रिय'.
 */
export function nameWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

interface Seen {
  id: string;
  name: string;
  nickname: string | null;
  labels: Array<{ sphere: string; orgName: string | null }>;
}

/** How likely two people someone knows are one, and why, in their words (their language). */
export function sameness(a: Seen, b: Seen): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0;
  const wa = nameWords(a.name);
  const wb = nameWords(b.name);
  const same = wa.length > 0 && wa.join(' ') === wb.join(' ');
  if (same && wa.length > 1) {
    confidence += 0.8;
    reasons.push(tr('the same name'));
  } else if (same) {
    // One word ("Sam") is many people's name.
    confidence += 0.5;
    reasons.push(tr('the same name'));
  } else {
    const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    if (short.length && short[0] === long[0] && short.every((w) => long.includes(w))) {
      confidence += 0.4;
      reasons.push(tr('one name is part of the other'));
    }
  }
  const na = a.nickname?.trim().toLowerCase();
  if (na && na === b.nickname?.trim().toLowerCase()) {
    confidence += 0.8;
    reasons.push(tr('the same nickname'));
  }
  const place = (l: { orgName: string | null }) => l.orgName?.trim().toLowerCase() || null;
  const shared = a.labels.find((x) => place(x) && b.labels.some((y) => place(y) === place(x)));
  if (shared && confidence > 0) {
    confidence += 0.3;
    reasons.push(tr('you know both from {org}', { org: shared.orgName }));
  }
  return { confidence: Math.min(1, confidence), reasons };
}

/** How many of someone's connections are compared at a time (all of them are, in turn). */
const PAGE = 500;

/**
 * After someone connects, or changes how they name or label a person: is that person (`subjectId`)
 * perhaps one of theirs already? Compared with every one of their connections, however many, and
 * with every account of anyone they've merged (a new account may look like any of them); offered
 * as that person. Each pair is offered once; "Keep separate" is remembered.
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
    .execute();
  // Each person as they're shown: the one merged into, while that one is still theirs.
  const theirs = new Set(sides.map((s) => s.other_id));
  const rootOf = (s: (typeof sides)[number]) =>
    s.merged_into && theirs.has(s.merged_into) ? s.merged_into : s.other_id;
  const subject = sides.find((s) => s.other_id === subjectId);
  // Someone already shown under another of theirs is offered as that one, never on their own.
  if (!subject || rootOf(subject) !== subjectId) return;
  const groups = new Map<string, typeof sides>();
  for (const s of sides) groups.set(rootOf(s), [...(groups.get(rootOf(s)) ?? []), s]);
  const mine = groups.get(subjectId) ?? [subject];
  const others = [...groups.keys()].filter((r) => r !== subjectId);
  for (let i = 0; i < others.length; i += PAGE) {
    const roots = others.slice(i, i + PAGE);
    const accounts = [...mine, ...roots.flatMap((r) => groups.get(r) ?? [])];
    const ids = accounts.map((s) => s.other_id);
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
    const ours = mine.map(seen).filter((x): x is NonNullable<typeof x> => Boolean(x));
    // In the owner's language: the reasons and the offer are theirs to read.
    await asReader(ctx, ownerId, async () => {
      for (const root of roots) {
        const group = groups.get(root) ?? [];
        const head = group.find((s) => s.other_id === root);
        const b = head ? seen(head) : null;
        if (!b) continue;
        // The closest any account of theirs comes to any of this person's.
        let best = { confidence: 0, reasons: [] as string[] };
        for (const x of ours)
          for (const y of group.map(seen))
            if (y) {
              const m = sameness(x, y);
              if (m.confidence > best.confidence) best = m;
            }
        if (best.confidence < OFFER_AT) continue;
        // Kept under the one they've known longer.
        const [keep, merge] = b.at <= a.at ? [b, a] : [a, b];
        const [x, y] = [a.id, b.id].sort();
        await createSuggestion(ctx, {
          userId: ownerId,
          kind: 'duplicate',
          title:
            merge.name === keep.name
              ? tr('{name} may have two accounts', { name: keep.name })
              : tr('{merge} and {keep} may be the same person', {
                  merge: merge.name,
                  keep: keep.name,
                }),
          rationale: tr(
            'Both have {reasons}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.',
            { reasons: best.reasons.join(tr(', and ')) },
          ),
          confidence: best.confidence,
          payload: { keep: keep.id, merge: merge.id },
          subjectUserId: merge.id,
          fingerprint: `duplicate:${x}:${y}`,
        });
      }
    });
  }
}

/**
 * Accounts merged under one that's no longer theirs (its connection removed, or its account
 * deleted) stay one person: the one known longest of the rest holds the others. For `owners`, or
 * everyone who merged anyone under it.
 */
export async function rerootMerged(db: Q, rootId: string, owners?: string[]): Promise<void> {
  if (owners && !owners.length) return;
  const rows = await db
    .selectFrom('connection_sides')
    .select(['owner_id', 'other_id'])
    .where('merged_into', '=', rootId)
    .$if(Boolean(owners), (q) => q.where('owner_id', 'in', owners as string[]))
    .orderBy('owner_id')
    .orderBy('created_at')
    .orderBy('other_id')
    .execute();
  const byOwner = new Map<string, string[]>();
  for (const r of rows) byOwner.set(r.owner_id, [...(byOwner.get(r.owner_id) ?? []), r.other_id]);
  for (const [owner, [first, ...rest]] of byOwner) {
    if (!first) continue;
    await db
      .updateTable('connection_sides')
      .set({ merged_into: null })
      .where('owner_id', '=', owner)
      .where('other_id', '=', first)
      .execute();
    if (rest.length)
      await db
        .updateTable('connection_sides')
        .set({ merged_into: first })
        .where('owner_id', '=', owner)
        .where('other_id', 'in', rest)
        .execute();
  }
}

/** Someone blocked either way: no offer of them as one of the other's duplicates stays. */
export async function withdrawDuplicatesOf(db: Q, a: string, b: string): Promise<void> {
  await db
    .deleteFrom('suggestions')
    .where('kind', '=', 'duplicate')
    .where('status', '=', 'pending')
    .where((eb) =>
      eb.or([
        eb.and([
          eb('user_id', '=', a),
          eb.or([
            eb(sql<string>`payload->>'keep'`, '=', b),
            eb(sql<string>`payload->>'merge'`, '=', b),
          ]),
        ]),
        eb.and([
          eb('user_id', '=', b),
          eb.or([
            eb(sql<string>`payload->>'keep'`, '=', a),
            eb(sql<string>`payload->>'merge'`, '=', a),
          ]),
        ]),
      ]),
    )
    .execute();
}
