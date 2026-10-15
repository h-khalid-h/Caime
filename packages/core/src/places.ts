/**
 * Places (R92): where a person or an organization is, each a named address shown to whom it's
 * for. A person's place is seen through the privacy evaluator's rules (its own `Audience`, the
 * "limited" preset hiding it, blocks hiding everything), never beyond family under 18; an
 * organization's is public, for its customers, or for its team. A place is used by copying it
 * (`placeLine` into a card's "Where", an order's delivery address), never by pointing at it, so a
 * card stays true when the place changes. Pure: the app and the server read it.
 */
import { msg, tr } from './i18n';
import { type Audience, audienceAllows, type Viewer } from './privacy';

/** What a place is to its owner: a word from this list, or the owner's own name (`label`). */
export const PLACE_KINDS = ['home', 'work', 'hq', 'branch', 'other'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  home: msg('Home address'),
  work: msg('Work address'),
  hq: msg('Headquarters'),
  branch: msg('Branch'),
  other: msg('Other'),
};

/** The kinds offered to a person and to an organization. */
export const PERSON_PLACE_KINDS: readonly PlaceKind[] = ['home', 'work', 'other'];
export const ORG_PLACE_KINDS: readonly PlaceKind[] = ['hq', 'branch', 'other'];

/** Who sees an organization's place: anyone (its page), its customers, or its team. */
export const ORG_PLACE_AUDIENCES = ['everyone', 'customers', 'team'] as const;
export type OrgPlaceAudience = (typeof ORG_PLACE_AUDIENCES)[number];

export const ORG_PLACE_AUDIENCE_LABELS: Record<OrgPlaceAudience, string> = {
  everyone: msg('Anyone, on your page'),
  customers: msg('Your customers'),
  team: msg('Your team'),
};

/** How many places one owner keeps: a household and a few branches, not a directory. */
export const PLACES_MAX = 20;

/** The parts of an address anywhere, each optional but the country. */
export interface PlaceParts {
  country: string;
  city: string | null;
  area: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  unit: string | null;
  postalCode: string | null;
  /** How to find it ("the green gate, ring twice"). */
  directions: string | null;
}

export interface PlacePoint {
  lat: number;
  lng: number;
}

/** A person's place is shown as their other fields are, the "limited" preset hiding it. */
export function placeVisible(audience: Audience, viewer: Viewer): boolean {
  if (viewer.isSelf) return true;
  if (viewer.blocked || viewer.preset === 'limited') return false;
  return audienceAllows(audience, viewer);
}

/**
 * Under 18 (R29) a place is never shown beyond family: anything wider than the family sphere
 * becomes family, and family or nobody stays as chosen.
 */
export function placeAudienceFor(audience: Audience, minor: boolean): Audience {
  if (!minor) return audience;
  if (audience.kind === 'nobody') return audience;
  if (audience.kind === 'spheres' && audience.spheres.every((s) => s === 'family')) return audience;
  return { kind: 'spheres', spheres: ['family'] };
}

/** Who an organization's place is shown to, by what the viewer is to it. */
export function orgPlaceVisible(
  audience: OrgPlaceAudience,
  viewer: { team: boolean; customer: boolean },
): boolean {
  if (viewer.team) return true;
  if (audience === 'everyone') return true;
  return audience === 'customers' && viewer.customer;
}

const clean = (v: string | null | undefined) => (v ?? '').trim();

/**
 * The address as one line, from the most particular part to the country's name: what a card's
 * "Where" and an order's delivery address carry. `countryName` names the country in the
 * reader's language (the app passes Intl's).
 */
export function placeLine(p: PlaceParts, countryName: (code: string) => string = (c) => c): string {
  const floor = clean(p.floor);
  const unit = clean(p.unit);
  const floorUnit = [
    unit ? tr('Unit {unit}', { unit }) : '',
    floor ? tr('Floor {floor}', { floor }) : '',
  ]
    .filter(Boolean)
    .join(', ');
  return [
    floorUnit,
    clean(p.building),
    clean(p.street),
    clean(p.area),
    [clean(p.city), clean(p.postalCode)].filter(Boolean).join(' '),
    countryName(p.country),
  ]
    .filter(Boolean)
    .join(', ');
}

/** A link that opens the point in the reader's maps (a web page anyone's browser opens). */
export function mapsUrl(point: PlacePoint): string {
  const lat = point.lat.toFixed(6);
  const lng = point.lng.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
