/**
 * Relationship suggestions from signals (PRD §12, §44). Never facts: each is stored as a
 * suggestion with a rationale (R12), and a dismissed one never returns (fingerprint).
 * Only non-sensitive signals: email domain, invitation context, shared organization.
 */
import { SPHERE_DEFS, type Sphere, uuidv7 } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';

const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'qq.com',
  '163.com',
  'example.com',
  'hey.com',
  'fastmail.com',
  'tutanota.com',
  'web.de',
  'orange.fr',
  'free.fr',
]);

export function orgNameFromDomain(domain: string): string {
  const label = domain.split('.').slice(-2, -1)[0] ?? domain;
  return label.length <= 4 ? label.toUpperCase() : label.charAt(0).toUpperCase() + label.slice(1);
}

export async function createSuggestion(
  ctx: AppContext,
  s: {
    userId: string;
    kind: string;
    title: string;
    rationale: string;
    confidence: number;
    payload?: Record<string, unknown>;
    subjectUserId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    dueAt?: string | null;
    dueText?: string | null;
    fingerprint: string;
  },
): Promise<string | null> {
  const id = uuidv7();
  const row = await ctx.db
    .insertInto('suggestions')
    .values({
      id,
      user_id: s.userId,
      kind: s.kind,
      title: s.title,
      rationale: s.rationale,
      confidence: s.confidence,
      payload: s.payload ?? {},
      subject_user_id: s.subjectUserId ?? null,
      conversation_id: s.conversationId ?? null,
      message_id: s.messageId ?? null,
      due_at: s.dueAt ?? null,
      due_text: s.dueText ?? null,
      fingerprint: s.fingerprint,
    })
    .onConflict((oc) => oc.columns(['user_id', 'fingerprint']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!row) return null;
  await ctx.bus.publish([s.userId], {
    type: 'suggestion.created',
    data: { id, kind: s.kind, conversationId: s.conversationId ?? null },
  });
  return id;
}

/** After a connection forms: suggest a classification for each side that hasn't made one. */
export async function suggestRelationships(
  ctx: AppContext,
  a: { id: string; email: string; displayName: string },
  b: { id: string; email: string; displayName: string },
  requestContext?: { fromUserId: string; sphere: string | null; orgName: string | null } | null,
): Promise<void> {
  const unclassified = async (owner: string, subject: string) => {
    const row = await ctx.db
      .selectFrom('relationships')
      .select(sql<number>`1`.as('x'))
      .where('owner_id', '=', owner)
      .where('subject_id', '=', subject)
      .where('status', '=', 'active')
      .executeTakeFirst();
    return !row;
  };
  const domainA = a.email.split('@')[1]?.toLowerCase() ?? '';
  const domainB = b.email.split('@')[1]?.toLowerCase() ?? '';
  const sameCompany = domainA && domainA === domainB && !PUBLIC_DOMAINS.has(domainA);

  for (const [owner, subject] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!(await unclassified(owner.id, subject.id))) continue;
    if (requestContext && requestContext.fromUserId === subject.id && requestContext.sphere) {
      const sphere = requestContext.sphere as Sphere;
      const where = requestContext.orgName ? ` · ${requestContext.orgName}` : '';
      await createSuggestion(ctx, {
        userId: owner.id,
        kind: 'relationship',
        title: `${SPHERE_DEFS[sphere]?.label ?? 'Other'}${where}`,
        rationale: `${subject.displayName} described how you know each other as ${SPHERE_DEFS[sphere]?.label ?? sphere}${where}.`,
        confidence: 0.8,
        payload: { sphere, role: null, orgName: requestContext.orgName },
        subjectUserId: subject.id,
        fingerprint: `relationship:${subject.id}:${sphere}:${requestContext.orgName ?? ''}`,
      });
      continue;
    }
    if (sameCompany) {
      const org = orgNameFromDomain(domainA);
      await createSuggestion(ctx, {
        userId: owner.id,
        kind: 'relationship',
        title: `Colleague · ${org}`,
        rationale: `You both use @${domainA} email addresses.`,
        confidence: 0.7,
        payload: { sphere: 'work', role: 'colleague', orgName: org },
        subjectUserId: subject.id,
        fingerprint: `relationship:${subject.id}:work:colleague:${org}`,
      });
    }
  }
}
