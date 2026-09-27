/**
 * Relationship suggestions from signals (PRD §12, §44). Never facts: each is stored as a
 * suggestion with a rationale (R12), and a dismissed one never returns (fingerprint).
 * Only non-sensitive signals: how the other person described it, a team or a space both are
 * in, and a company email domain both use.
 */
import { SPACE_KIND_DEFS, SPHERE_DEFS, type SpaceKind, type Sphere, uuidv7 } from '@caishy/core';
import { type Insertable, sql } from 'kysely';
import type { AppContext } from '../context';
import type { SuggestionsTable } from '../db/schema';
import { personViewsFor } from './people-batch';

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

/**
 * One offer of a relationship per person and kind of relationship, however it came to be
 * offered (how they described it, a team, a space, an email domain): so one dismissed stays
 * dismissed, and the same offer never shows twice.
 */
export function relationshipFingerprint(
  subjectId: string,
  o: { sphere: string; role?: string | null; orgName?: string | null },
): string {
  return `relationship:${subjectId}:${o.sphere}:${o.role ?? ''}:${(o.orgName ?? '').toLowerCase()}`;
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
  | { kind: 'org'; id: string; name: string; verified: boolean }
  | { kind: 'space'; id: string; name: string; spaceKind: SpaceKind };

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
    payload: { sphere: o.sphere, role: o.role, orgName: o.orgName, place: placeRef(place) },
    subjectUserId: subject.id,
    fingerprint: relationshipFingerprint(subject.id, o),
  });
}

/** Which team or space an offer comes from, so it goes when either of the two leaves it. */
const placeRef = (place: Place) => ({ kind: place.kind, id: place.id });

/**
 * Someone left a team or a space: what Caishy offered because of it, to them or about them, is
 * taken back (and may be offered again if they're both there again).
 */
export async function withdrawPlaceOffers(
  ctx: AppContext,
  place: { kind: Place['kind']; id: string },
  userId: string,
): Promise<void> {
  const gone = await ctx.db
    .deleteFrom('suggestions')
    .where('kind', '=', 'relationship')
    .where('status', '=', 'pending')
    .where(sql`payload->'place'->>'kind'`, '=', place.kind)
    .where(sql`payload->'place'->>'id'`, '=', place.id)
    .where((eb) => eb.or([eb('user_id', '=', userId), eb('subject_user_id', '=', userId)]))
    .returning(['id', 'user_id'])
    .execute();
  for (const g of gone)
    await ctx.bus.publish([g.user_id], {
      type: 'suggestion.resolved',
      data: { id: g.id, status: 'expired' },
    });
}

/** The name someone shows another: their identity for them, never their account's. */
async function nameShownTo(
  ctx: AppContext,
  viewerId: string,
  person: { id: string; displayName: string },
): Promise<string> {
  return (
    (await personViewsFor(ctx, viewerId, [person.id])).get(person.id)?.displayName ??
    person.displayName
  );
}

/** The team, else the space, two people are both in now: a verified organization first. */
async function sharedPlace(ctx: AppContext, a: string, b: string): Promise<Place | null> {
  const org = await ctx.db
    .selectFrom('org_members as x')
    .innerJoin('org_members as y', (j) =>
      j.onRef('y.org_id', '=', 'x.org_id').on('y.user_id', '=', b).on('y.left_at', 'is', null),
    )
    .innerJoin('organizations as o', 'o.id', 'x.org_id')
    .select(['o.id', 'o.name', 'o.verified_at'])
    .where('x.user_id', '=', a)
    .where('x.left_at', 'is', null)
    .orderBy(sql`o.verified_at is null`)
    .orderBy('o.name')
    .executeTakeFirst();
  if (org) return { kind: 'org', id: org.id, name: org.name, verified: org.verified_at !== null };
  const space = await ctx.db
    .selectFrom('space_members as x')
    .innerJoin('space_members as y', (j) =>
      j.onRef('y.space_id', '=', 'x.space_id').on('y.user_id', '=', b).on('y.left_at', 'is', null),
    )
    .innerJoin('spaces as sp', 'sp.id', 'x.space_id')
    .select(['sp.id', 'sp.name', 'sp.kind'])
    .where('x.user_id', '=', a)
    .where('x.left_at', 'is', null)
    .where('sp.kind', '<>', 'other')
    .orderBy('sp.name')
    .executeTakeFirst();
  return space
    ? { kind: 'space', id: space.id, name: space.name, spaceKind: space.kind as SpaceKind }
    : null;
}

/**
 * Someone joined a team or a space: to each side of each pair of them connected there who hasn't
 * said how they know the other, Caishy offers what the place suggests. Never decided for them,
 * never between two people either of whom has blocked the other. Read and written a whole place
 * at a time: a space of two hundred people who know each other is one read and a few writes.
 */
export async function suggestFromPlace(
  ctx: AppContext,
  place: Place,
  newcomers: string[],
  members: string[],
): Promise<void> {
  const everyone = [...new Set([...newcomers, ...members])];
  if (!newcomers.length || everyone.length < 2 || !offerOf(place, '')) return;
  // Each way of each pair: the one who'd be offered, and who they'd be offered about.
  const pairs = await ctx.db
    .selectFrom('connection_sides as s')
    .innerJoin('connections as c', 'c.id', 's.connection_id')
    .select(['s.owner_id', 's.other_id'])
    .where('c.status', '=', 'active')
    .where('s.owner_id', 'in', everyone)
    .where('s.other_id', 'in', everyone)
    .whereRef('s.owner_id', '<>', 's.other_id')
    .where((eb) => eb.or([eb('s.owner_id', 'in', newcomers), eb('s.other_id', 'in', newcomers)]))
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('relationships as r')
            .select('r.id')
            .whereRef('r.owner_id', '=', 's.owner_id')
            .whereRef('r.subject_id', '=', 's.other_id')
            .where('r.status', '=', 'active'),
        ),
      ),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('blocks as b')
            .select('b.blocker_id')
            .where((w) =>
              w.or([
                w.and([
                  w('b.blocker_id', '=', w.ref('s.owner_id')),
                  w('b.blocked_id', '=', w.ref('s.other_id')),
                ]),
                w.and([
                  w('b.blocker_id', '=', w.ref('s.other_id')),
                  w('b.blocked_id', '=', w.ref('s.owner_id')),
                ]),
              ]),
            ),
        ),
      ),
    )
    .execute();
  if (!pairs.length) return;
  const byOwner = new Map<string, string[]>();
  for (const p of pairs) byOwner.set(p.owner_id, [...(byOwner.get(p.owner_id) ?? []), p.other_id]);
  const rows: Insertable<SuggestionsTable>[] = [];
  for (const [owner, subjects] of byOwner) {
    // Each is named as they show themselves to whoever is offered.
    const shown = await personViewsFor(ctx, owner, subjects);
    for (const subject of subjects) {
      const o = offerOf(place, shown.get(subject)?.displayName ?? 'them');
      if (!o) continue;
      rows.push({
        id: uuidv7(),
        user_id: owner,
        kind: 'relationship',
        title: o.title,
        rationale: o.rationale,
        confidence: o.confidence,
        payload: { sphere: o.sphere, role: o.role, orgName: o.orgName, place: placeRef(place) },
        subject_user_id: subject,
        fingerprint: relationshipFingerprint(subject, o),
      });
    }
  }
  const offered = new Set<string>();
  for (let i = 0; i < rows.length; i += 500) {
    const made = await ctx.db
      .insertInto('suggestions')
      .values(rows.slice(i, i + 500))
      .onConflict((oc) => oc.columns(['user_id', 'fingerprint']).doNothing())
      .returning('user_id')
      .execute();
    for (const m of made) offered.add(m.user_id);
  }
  for (const userId of offered)
    await ctx.bus.publish([userId], {
      type: 'suggestion.created',
      data: { kind: 'relationship', conversationId: null },
    });
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
    const shown = { id: subject.id, displayName: await nameShownTo(ctx, owner.id, subject) };
    if (requestContext && requestContext.fromUserId === subject.id && requestContext.sphere) {
      const sphere = requestContext.sphere as Sphere;
      const where = requestContext.orgName ? ` · ${requestContext.orgName}` : '';
      await createSuggestion(ctx, {
        userId: owner.id,
        kind: 'relationship',
        title: `${SPHERE_DEFS[sphere]?.label ?? 'Other'}${where}`,
        rationale: `${shown.displayName} described how you know each other as ${SPHERE_DEFS[sphere]?.label ?? sphere}${where}.`,
        confidence: 0.8,
        payload: { sphere, role: null, orgName: requestContext.orgName },
        subjectUserId: subject.id,
        fingerprint: relationshipFingerprint(subject.id, {
          sphere,
          orgName: requestContext.orgName,
        }),
      });
      continue;
    }
    // A team they're both on says more than an email domain; a space they share, less.
    const place = await sharedPlace(ctx, owner.id, subject.id);
    if (place?.kind === 'org') {
      await offer(ctx, owner.id, shown, place);
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
        fingerprint: relationshipFingerprint(subject.id, {
          sphere: 'work',
          role: 'colleague',
          orgName: org,
        }),
      });
      continue;
    }
    if (place) await offer(ctx, owner.id, shown, place);
  }
}
