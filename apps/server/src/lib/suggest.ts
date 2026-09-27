/**
 * Relationship suggestions from signals (PRD §12, §44). Never facts: each is stored as a
 * suggestion with a rationale (R12), and a dismissed one never returns (fingerprint).
 * Only non-sensitive signals: how the other person described it, a team or a space both are
 * in, and a company email domain both use.
 */
import { SPACE_KIND_DEFS, SPHERE_DEFS, type SpaceKind, type Sphere, uuidv7 } from '@caishy/core';
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

/** Somewhere two people both are, as a reason one might know the other. */
export type Place =
  | { kind: 'org'; name: string; verified: boolean }
  | { kind: 'space'; name: string; spaceKind: SpaceKind };

/** What a shared place suggests, if anything: a team is work, a space is what it's for. */
function offerOf(place: Place, other: string) {
  if (place.kind === 'org')
    return {
      sphere: 'work' as Sphere,
      role: 'colleague',
      orgName: place.name,
      title: `Colleague · ${place.name}`,
      rationale: place.verified
        ? `You and ${other} are both on ${place.name}’s team, and ${place.name} is verified.`
        : `You and ${other} are both on ${place.name}’s team in Caishy.`,
      confidence: place.verified ? 0.85 : 0.75,
    };
  const sphere = SPACE_KIND_DEFS[place.spaceKind]?.sphere;
  if (!sphere || sphere === 'other') return null;
  const role = place.spaceKind === 'team' || place.spaceKind === 'project' ? 'colleague' : null;
  return {
    sphere,
    role,
    orgName: null,
    title: SPHERE_DEFS[sphere].label,
    rationale: `You and ${other} are both in ${place.name}, a ${SPACE_KIND_DEFS[place.spaceKind].label.toLowerCase()} space.`,
    confidence: 0.6,
  };
}

async function unclassifiedBy(ctx: AppContext, owner: string, subject: string) {
  const row = await ctx.db
    .selectFrom('relationships')
    .select(sql<number>`1`.as('x'))
    .where('owner_id', '=', owner)
    .where('subject_id', '=', subject)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return !row;
}

async function offer(
  ctx: AppContext,
  owner: string,
  subject: { id: string; displayName: string },
  place: Place,
) {
  const o = offerOf(place, subject.displayName);
  if (!o) return;
  await createSuggestion(ctx, {
    userId: owner,
    kind: 'relationship',
    title: o.title,
    rationale: o.rationale,
    confidence: o.confidence,
    payload: { sphere: o.sphere, role: o.role, orgName: o.orgName },
    subjectUserId: subject.id,
    fingerprint: `relationship:${subject.id}:${o.sphere}:${o.role ?? ''}:${o.orgName ?? ''}`,
  });
}

/** The team, else the space, two people are both in now: a verified organization first. */
async function sharedPlace(ctx: AppContext, a: string, b: string): Promise<Place | null> {
  const org = await ctx.db
    .selectFrom('org_members as x')
    .innerJoin('org_members as y', (j) =>
      j.onRef('y.org_id', '=', 'x.org_id').on('y.user_id', '=', b).on('y.left_at', 'is', null),
    )
    .innerJoin('organizations as o', 'o.id', 'x.org_id')
    .select(['o.name', 'o.verified_at'])
    .where('x.user_id', '=', a)
    .where('x.left_at', 'is', null)
    .orderBy(sql`o.verified_at is null`)
    .orderBy('o.name')
    .executeTakeFirst();
  if (org) return { kind: 'org', name: org.name, verified: org.verified_at !== null };
  const space = await ctx.db
    .selectFrom('space_members as x')
    .innerJoin('space_members as y', (j) =>
      j.onRef('y.space_id', '=', 'x.space_id').on('y.user_id', '=', b).on('y.left_at', 'is', null),
    )
    .innerJoin('spaces as sp', 'sp.id', 'x.space_id')
    .select(['sp.name', 'sp.kind'])
    .where('x.user_id', '=', a)
    .where('x.left_at', 'is', null)
    .where('sp.kind', '<>', 'other')
    .orderBy('sp.name')
    .executeTakeFirst();
  return space ? { kind: 'space', name: space.name, spaceKind: space.kind as SpaceKind } : null;
}

/**
 * Someone joined a team or a space: to each side of each pair of them connected there who hasn't
 * said how they know the other, Caishy offers what the place suggests. Never decided for them.
 */
export async function suggestFromPlace(
  ctx: AppContext,
  place: Place,
  newcomers: string[],
  members: string[],
): Promise<void> {
  const everyone = [...new Set([...newcomers, ...members])];
  if (!newcomers.length || everyone.length < 2) return;
  const [pairs, names] = await Promise.all([
    ctx.db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .select(['s.owner_id', 's.other_id'])
      .where('c.status', '=', 'active')
      .where('s.owner_id', 'in', newcomers)
      .where('s.other_id', 'in', everyone)
      .execute(),
    ctx.db.selectFrom('users').select(['id', 'display_name']).where('id', 'in', everyone).execute(),
  ]);
  const name = (id: string) => names.find((u) => u.id === id)?.display_name ?? 'them';
  const seen = new Set<string>();
  for (const { owner_id: n, other_id: o } of pairs) {
    const key = [n, o].sort().join(':');
    if (n === o || seen.has(key)) continue;
    seen.add(key);
    for (const [owner, subject] of [
      [n, o],
      [o, n],
    ] as const)
      if (await unclassifiedBy(ctx, owner, subject))
        await offer(ctx, owner, { id: subject, displayName: name(subject) }, place);
  }
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
    // A team they're both on says more than an email domain; a space they share, less.
    const place = await sharedPlace(ctx, owner.id, subject.id);
    if (place?.kind === 'org') {
      await offer(ctx, owner.id, subject, place);
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
      continue;
    }
    if (place) await offer(ctx, owner.id, subject, place);
  }
}
