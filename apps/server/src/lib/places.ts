/**
 * Places (R92, core `places.ts`): a person's and an organization's named addresses. A person's is
 * shown through the privacy evaluator (`placeVisible`, never beyond family under 18), an
 * organization's to anyone, its customers or its team (`orgPlaceVisible`). Saved as a whole list
 * in its owner's order; a card copies a place's words (`placeLine`) and nothing points here.
 */

import type { PlaceInput } from '@caime/core';
import { type Audience, uuidv7 } from '@caime/core';
import type { ConversationPlacesResponse, PlaceView } from '@caime/core/api';
import type { BookingHours, BookingItem } from '@caime/core/booking';
import { currentTranslator, tr } from '@caime/core/i18n';
import {
  ORG_PLACE_KINDS,
  type OrgPlaceAudience,
  orgPlaceVisible,
  PERSON_PLACE_KINDS,
  type PlaceKind,
  placeAudienceFor,
  placeLine,
  placeVisible,
} from '@caime/core/places';
import type { z } from 'zod';
import type { AppContext } from '../context';
import type { PlacesTable } from '../db/schema';
import { badRequest } from './errors';
import { countryNameIn, isCountry } from './geo';
import { viewerRelation } from './relations';
import { minorOf } from './users';

type Row = Omit<PlacesTable, 'position' | 'created_at' | 'updated_at' | 'audience'> & {
  audience: Audience | null;
};

const COLUMNS = [
  'id',
  'user_id',
  'org_id',
  'kind',
  'label',
  'country',
  'city',
  'area',
  'street',
  'building',
  'floor',
  'unit',
  'postal_code',
  'directions',
  'lat',
  'lng',
  'audience',
  'org_audience',
] as const;

/** A place as its viewer reads it; who sees it is said to its owner (`owner`) alone. */
export function placeView(r: Row, owner: boolean): PlaceView {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    country: r.country,
    city: r.city,
    area: r.area,
    street: r.street,
    building: r.building,
    floor: r.floor,
    unit: r.unit,
    postalCode: r.postal_code,
    directions: r.directions,
    point: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
    audience: owner ? r.audience : null,
    orgAudience: owner ? r.org_audience : null,
  };
}

async function rowsOf(ctx: Pick<AppContext, 'db'>, owner: { userId: string } | { orgId: string }) {
  const q = ctx.db.selectFrom('places').select(COLUMNS).orderBy('position').orderBy('created_at');
  const rows =
    'userId' in owner
      ? await q.where('user_id', '=', owner.userId).execute()
      : await q.where('org_id', '=', owner.orgId).execute();
  return rows as Row[];
}

/** Every place an owner keeps, as its owner reads them (an export, an organization's team). */
export async function placesOwnedBy(
  ctx: Pick<AppContext, 'db'>,
  owner: { userId: string } | { orgId: string },
): Promise<PlaceView[]> {
  return (await rowsOf(ctx, owner)).map((r) => placeView(r, true));
}

/** A person's own places, with who sees each. */
export async function myPlaces(ctx: AppContext, userId: string): Promise<PlaceView[]> {
  return (await rowsOf(ctx, { userId })).map((r) => placeView(r, true));
}

/** A person's places this viewer may see, by the owner's rules for them. */
export async function personPlacesFor(
  ctx: AppContext,
  owner: { id: string; birth_date: string | null; time_zone: string },
  viewerId: string,
): Promise<PlaceView[]> {
  if (owner.id === viewerId) return myPlaces(ctx, viewerId);
  const rows = await rowsOf(ctx, { userId: owner.id });
  if (!rows.length) return [];
  const relation = await viewerRelation(ctx.db, owner.id, viewerId);
  const minor = minorOf(owner, ctx.now());
  return rows
    .filter((r) =>
      placeVisible(placeAudienceFor(r.audience ?? { kind: 'nobody' }, minor), relation),
    )
    .map((r) => placeView(r, false));
}

/** What the viewer is to an organization, for its places: on its team, or a customer. */
async function standingWith(ctx: Pick<AppContext, 'db'>, orgId: string, viewerId: string | null) {
  if (!viewerId) return { team: false, customer: false };
  const [seat, thread] = await Promise.all([
    ctx.db
      .selectFrom('org_members')
      .select('user_id')
      .where('org_id', '=', orgId)
      .where('user_id', '=', viewerId)
      .where('left_at', 'is', null)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', orgId)
      .where('customer_id', '=', viewerId)
      .executeTakeFirst(),
  ]);
  return { team: Boolean(seat), customer: Boolean(thread) };
}

/** An organization's places this viewer may see; its team sees all, with who sees each. */
export async function orgPlacesFor(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
  viewerId: string | null,
): Promise<PlaceView[]> {
  const rows = await rowsOf(ctx, { orgId });
  if (!rows.length) return [];
  const standing = await standingWith(ctx, orgId, viewerId);
  return rows
    .filter((r) => orgPlaceVisible(r.org_audience ?? 'team', standing))
    .map((r) => placeView(r, standing.team));
}

type Input = z.infer<typeof PlaceInput>;
const part = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/**
 * Saves an owner's whole list, in its order: one kept by its id stays that row, one left out
 * goes, a new one is made. A person's audience is clamped under 18 as it's saved.
 */
export async function savePlaces(
  ctx: AppContext,
  owner: { userId: string; minor: boolean } | { orgId: string },
  places: Input[],
): Promise<PlaceView[]> {
  const isPerson = 'userId' in owner;
  const kinds: readonly PlaceKind[] = isPerson ? PERSON_PLACE_KINDS : ORG_PLACE_KINDS;
  for (const p of places) {
    if (!kinds.includes(p.kind)) throw badRequest(tr('That kind of place isn’t offered here.'));
    if (!isCountry(p.country)) throw badRequest(tr('Choose a country.'));
  }
  const now = ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    const existing = await (isPerson
      ? trx.selectFrom('places').select('id').where('user_id', '=', owner.userId)
      : trx.selectFrom('places').select('id').where('org_id', '=', owner.orgId)
    ).execute();
    const ids = new Set(existing.map((r) => r.id));
    const kept = new Set<string>();
    for (const [position, p] of places.entries()) {
      const audience: Audience | null = isPerson
        ? placeAudienceFor(p.audience ?? { kind: 'nobody' }, owner.minor)
        : null;
      const orgAudience: OrgPlaceAudience | null = isPerson ? null : (p.orgAudience ?? 'team');
      const values = {
        kind: p.kind,
        label: part(p.label),
        country: p.country,
        city: part(p.city),
        area: part(p.area),
        street: part(p.street),
        building: part(p.building),
        floor: part(p.floor),
        unit: part(p.unit),
        postal_code: part(p.postalCode),
        directions: part(p.directions),
        lat: p.point?.lat ?? null,
        lng: p.point?.lng ?? null,
        audience: audience ? JSON.stringify(audience) : null,
        org_audience: orgAudience,
        position,
        updated_at: now,
      };
      if (p.id && ids.has(p.id) && !kept.has(p.id)) {
        kept.add(p.id);
        await trx.updateTable('places').set(values).where('id', '=', p.id).execute();
      } else {
        await trx
          .insertInto('places')
          .values({
            id: uuidv7(),
            user_id: isPerson ? owner.userId : null,
            org_id: isPerson ? null : owner.orgId,
            created_at: now,
            ...values,
          })
          .execute();
      }
    }
    const gone = [...ids].filter((id) => !kept.has(id));
    if (gone.length) await trx.deleteFrom('places').where('id', 'in', gone).execute();
    // An organization's items and hours point only at places its customers may see (R92): one
    // gone, or now its team's alone, is let go of there in the same save.
    if (!isPerson) {
      const open = await trx
        .selectFrom('places')
        .select('id')
        .where('org_id', '=', owner.orgId)
        .where('org_audience', '!=', 'team')
        .execute();
      await letGoOfPlaces(trx, owner.orgId, new Set(open.map((r) => r.id)), now);
    }
  });
  return placesOwnedBy(ctx, isPerson ? { userId: owner.userId } : { orgId: owner.orgId });
}

/**
 * What a card's "Where" may be filled from in a conversation (R92): the viewer's own places,
 * and the other side's they may see: in a one-to-one, the other person's; in a customer
 * conversation, the organization's (to its customer, those for customers; to its team, all).
 */
export async function conversationPlaces(
  ctx: AppContext,
  userId: string,
  conversation: { id: string; kind: string; org_id: string | null },
  others: Array<{ id: string; display_name: string; birth_date: string | null; time_zone: string }>,
): Promise<ConversationPlacesResponse> {
  const mine = await myPlaces(ctx, userId);
  const theirs: ConversationPlacesResponse['theirs'] = [];
  if (conversation.kind === 'business' && conversation.org_id) {
    const org = await ctx.db
      .selectFrom('organizations')
      .select('name')
      .where('id', '=', conversation.org_id)
      .executeTakeFirst();
    const places = await orgPlacesFor(ctx, conversation.org_id, userId);
    if (org && places.length) theirs.push({ owner: org.name, places });
  } else if (conversation.kind === 'direct') {
    for (const o of others) {
      const places = await personPlacesFor(ctx, o, userId);
      if (places.length) theirs.push({ owner: o.display_name, places });
    }
  }
  return { mine, theirs };
}

/**
 * The places an organization's bookings may be at (R92): its own, for its customers or for
 * everyone, never its team's alone, since a booking copies the address to its customer.
 */
export async function bookablePlaceIds(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
): Promise<Set<string>> {
  const rows = await ctx.db
    .selectFrom('places')
    .select('id')
    .where('org_id', '=', orgId)
    .where('org_audience', '!=', 'team')
    .execute();
  return new Set(rows.map((r) => r.id));
}

/** Drops an organization's items' and hours' pointers at places no longer among `open`. */
async function letGoOfPlaces(
  trx: Pick<AppContext, 'db'>['db'],
  orgId: string,
  open: Set<string>,
  now: Date,
): Promise<void> {
  const org = await trx
    .selectFrom('organizations')
    .select(['booking', 'booking_items'])
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!org) return;
  const hours = (org.booking as BookingHours | null) ?? null;
  const items = ((org.booking_items as BookingItem[] | null) ?? []) as BookingItem[];
  const strayItem = items.some((i) => i.placeId && !open.has(i.placeId));
  const strayHours = (hours?.placeHours ?? []).some((p) => !open.has(p.placeId));
  if (!strayItem && !strayHours) return;
  const placeHours = (hours?.placeHours ?? []).filter((p) => open.has(p.placeId));
  await trx
    .updateTable('organizations')
    .set({
      booking: hours
        ? JSON.stringify({
            ...hours,
            ...(placeHours.length ? { placeHours } : { placeHours: undefined }),
          })
        : null,
      booking_items: JSON.stringify(
        items.map((i) => (i.placeId && !open.has(i.placeId) ? { ...i, placeId: null } : i)),
      ),
      updated_at: now,
    })
    .where('id', '=', orgId)
    .execute();
}

/** Each bookable place's address, by id (R92): the agent's catalog says where each item is. */
export async function bookablePlaceLines(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .selectFrom('places')
    .select(COLUMNS)
    .where('org_id', '=', orgId)
    .where('org_audience', '!=', 'team')
    .execute();
  const language = currentTranslator().language;
  return new Map(
    rows.map((r) => [
      r.id,
      placeLine(placeView(r as Row, false), (code) => countryNameIn(code, language)),
    ]),
  );
}

/**
 * Where a booking of an organization's item is (R92): its place's address, written in the
 * request's language, to be copied into the card; null for an item done wherever.
 */
export async function bookingWhere(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
  placeId: string | null | undefined,
): Promise<string | null> {
  if (!placeId) return null;
  const row = await ctx.db
    .selectFrom('places')
    .select(COLUMNS)
    .where('id', '=', placeId)
    .where('org_id', '=', orgId)
    .where('org_audience', '!=', 'team')
    .executeTakeFirst();
  if (!row) return null;
  const language = currentTranslator().language;
  return placeLine(placeView(row as Row, false), (code) => countryNameIn(code, language));
}
