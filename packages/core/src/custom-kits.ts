/**
 * Connect Kits an organization's app makes (PRD §74, §86 "Custom"): its own kinds of card, with
 * the fields they hold, the states they move through and who moves them. A kit is data, never
 * code or markup: its cards read like Caime's own, and whatever an app writes in one is shown as
 * text. A card keeps the kit as it was when the card was sent, so changing or removing the kit,
 * or the app, never changes a card already in a conversation.
 */

import { tr } from './i18n';
import { cleanKitFields, fieldDetails, kitStateLabel } from './kit-cards';
import type { KitField } from './kits';

export const CUSTOM_KIT_FIELD_TYPES = [
  'text',
  'longtext',
  'date',
  'datetime',
  'amount',
  'options',
] as const;

/** A custom card's icon: one of those the apps already carry for Caime's own kits. */
export const CUSTOM_KIT_ICONS = [
  'clipboard-list',
  'package',
  'truck',
  'receipt',
  'hand-coins',
  'life-buoy',
  'calendar-check',
  'calendar-clock',
  'badge-check',
  'file-check',
  'list-checks',
  'images',
  'chart-bar',
  'map-pin',
] as const;
export type CustomKitIcon = (typeof CUSTOM_KIT_ICONS)[number];

/** Who makes a move: the organization (its team and its apps), its customer, or either. */
export type CustomKitSide = 'organization' | 'customer' | 'anyone';

export interface CustomKitState {
  id: string;
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface CustomKitMove {
  from: string;
  to: string;
  label: string;
  who: CustomKitSide;
}

/** What a card needs of its kit to be read and moved: kept on the card itself. */
export interface CustomKitShape {
  fields: KitField[];
  /** The first is where a card starts. */
  states: CustomKitState[];
  moves: CustomKitMove[];
  /** Never in a conversation with anyone under 18: on for any kit with an amount (R29). */
  adultsOnly: boolean;
}

export interface CustomKitDef extends CustomKitShape {
  key: string;
  name: string;
  description: string;
  icon: CustomKitIcon;
}

export const CUSTOM_KIT_LIMITS = {
  perApp: 20,
  fields: 12,
  states: 8,
  moves: 24,
  choices: 12,
} as const;

/** A custom card, as it's kept on its message. */
export interface CustomKitCard {
  kit: 'custom';
  app: { id: string; name: string };
  key: string;
  label: string;
  icon: CustomKitIcon;
  title: string;
  fields: Record<string, unknown>;
  state: string;
  history: Array<{ state: string; by: string; at: string }>;
  def: CustomKitShape;
}

export function isCustomCard(payload: unknown): payload is CustomKitCard {
  const p = payload as Partial<CustomKitCard> | null;
  return (
    p?.kit === 'custom' &&
    typeof p.key === 'string' &&
    typeof p.state === 'string' &&
    typeof p.app?.id === 'string' &&
    Array.isArray(p.def?.fields) &&
    Array.isArray(p.def?.states) &&
    Array.isArray(p.def?.moves)
  );
}

// --- Checking what an app sends ------------------------------------------------------------------

const KIT_KEY = /^[a-z][a-z0-9_]{1,39}$/;
const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const STATE_ID = /^[a-z][a-z0-9_]{0,39}$/;
/**
 * Control characters, the marks that reorder text, and line and paragraph separators: a label
 * reads as it's written, on one line. (Joiners stay: Persian needs them, and so do emoji.)
 */
const UNSAFE = /[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/u;
/** Something to see: not only spaces, or characters that show nothing. */
const VISIBLE = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u;
const SIDES: readonly CustomKitSide[] = ['organization', 'customer', 'anyone'];
const TONES: readonly CustomKitState['tone'][] = ['positive', 'negative', 'neutral'];

class Invalid extends Error {}

function words(v: unknown, what: string, max: number, optional = false): string {
  if ((v === undefined || v === null || v === '') && optional) return '';
  if (typeof v !== 'string' || !v.trim())
    throw new Invalid(tr('{what}: write it as text.', { what }));
  const text = v.trim();
  if (text.length > max)
    throw new Invalid(tr('{what}: keep it under {max} characters.', { what, max }));
  if (UNSAFE.test(text)) throw new Invalid(tr('{what}: plain text only.', { what }));
  if (!VISIBLE.test(text)) throw new Invalid(tr('{what}: write it as text.', { what }));
  return text;
}

function list(v: unknown, what: string, min: number, max: number): unknown[] {
  if (v === undefined && min === 0) return [];
  if (!Array.isArray(v)) throw new Invalid(tr('{what}: a list, please.', { what }));
  if (v.length < min || v.length > max)
    throw new Invalid(
      tr('{what}: {min}, please.', { what, min: min === max ? min : `${min} to ${max}` }),
    );
  return v;
}

function object(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Invalid(tr('{what}: an object.', { what }));
  return v as Record<string, unknown>;
}

function field(v: unknown, i: number): KitField {
  const f = object(v, tr('Field {i}', { i: i + 1 }));
  if (typeof f.key !== 'string' || !FIELD_KEY.test(f.key))
    throw new Invalid(
      tr('Field {i}: its key is a letter, then letters, digits or _.', { i: i + 1 }),
    );
  const what = tr('Field “{key}”', { key: f.key });
  const type = f.type as KitField['type'];
  if (!(CUSTOM_KIT_FIELD_TYPES as readonly string[]).includes(type))
    throw new Invalid(
      tr('{what}: its type is one of {join}.', { what, join: CUSTOM_KIT_FIELD_TYPES.join(', ') }),
    );
  const out: KitField = { key: f.key, label: words(f.label, `${what}’s label`, 40), type };
  if (f.required === true) out.required = true;
  else if (f.required !== undefined && f.required !== false)
    throw new Invalid(tr('{what}: required is true or false.', { what }));
  const placeholder = words(f.placeholder, `${what}’s placeholder`, 60, true);
  if (placeholder) out.placeholder = placeholder;
  if (type === 'options') {
    const seen = new Set<string>();
    out.choices = list(f.choices, `${what}’s choices`, 2, CUSTOM_KIT_LIMITS.choices).map((c, j) => {
      const choice = object(c, `${what}’s choice ${j + 1}`);
      const value =
        typeof choice.value === 'number' && Number.isFinite(choice.value)
          ? choice.value
          : words(choice.value, `${what}’s choice ${j + 1}`, 40);
      if (seen.has(String(value))) throw new Invalid(tr('{what}: each choice once.', { what }));
      seen.add(String(value));
      return { value, label: words(choice.label, `${what}’s choice ${j + 1} label`, 40) };
    });
  } else if (f.choices !== undefined)
    throw new Invalid(tr('{what}: only options have choices.', { what }));
  return out;
}

/**
 * Checks a kit as an app describes it: `{ name, description?, icon?, fields, states, moves?,
 * adultsOnly? }`, its key given apart (it's the kit's address). Anything else is refused, with
 * what to change.
 */
export function parseCustomKit(
  key: unknown,
  input: unknown,
): { ok: true; def: CustomKitDef } | { ok: false; error: string } {
  try {
    if (typeof key !== 'string' || !KIT_KEY.test(key))
      throw new Invalid(
        tr('A kit’s key is 2 to 40 lowercase letters, digits or _, from a letter.'),
      );
    const k = object(input, 'The kit');
    const known = new Set(['key', 'name', 'description', 'icon', 'fields', 'states', 'moves']);
    known.add('adultsOnly');
    for (const name of Object.keys(k))
      if (!known.has(name)) throw new Invalid(tr('The kit has no “{name}”.', { name }));
    if (k.key !== undefined && k.key !== key)
      throw new Invalid(tr('The kit’s key is the one in its address.'));
    const icon = (k.icon ?? 'clipboard-list') as CustomKitIcon;
    if (!CUSTOM_KIT_ICONS.includes(icon))
      throw new Invalid(tr('Its icon is one of {join}.', { join: CUSTOM_KIT_ICONS.join(', ') }));

    const fields = list(k.fields, 'Fields', 1, CUSTOM_KIT_LIMITS.fields).map(field);
    if (new Set(fields.map((f) => f.key)).size !== fields.length)
      throw new Invalid(tr('Each field has a key of its own.'));
    // Each reads as itself: no two fields, states, or buttons on one state, with one label.
    const same = (labels: string[]) =>
      new Set(labels.map((l) => l.toLocaleLowerCase('en'))).size !== labels.length;
    if (same(fields.map((f) => f.label)))
      throw new Invalid(tr('Each field has a label of its own.'));

    const states = list(k.states, 'States', 1, CUSTOM_KIT_LIMITS.states).map((v, i) => {
      const s = object(v, tr('State {i}', { i: i + 1 }));
      if (typeof s.id !== 'string' || !STATE_ID.test(s.id))
        throw new Invalid(tr('State {i}: its id is lowercase letters, digits or _.', { i: i + 1 }));
      const tone = (s.tone ?? 'neutral') as CustomKitState['tone'];
      if (!TONES.includes(tone))
        throw new Invalid(
          tr('State “{id}”: its tone is positive, negative or neutral.', { id: s.id }),
        );
      return {
        id: s.id,
        label: words(s.label, tr('State “{id}”’s label', { id: s.id }), 40),
        tone,
      };
    });
    const ids = new Set(states.map((s) => s.id));
    if (ids.size !== states.length) throw new Invalid(tr('Each state has an id of its own.'));
    if (same(states.map((s) => s.label)))
      throw new Invalid(tr('Each state has a label of its own.'));

    const pairs = new Set<string>();
    const moves = list(k.moves, 'Moves', 0, CUSTOM_KIT_LIMITS.moves).map((v, i) => {
      const m = object(v, tr('Move {i}', { i: i + 1 }));
      if (typeof m.from !== 'string' || !ids.has(m.from))
        throw new Invalid(tr('Move {i}: it goes from one of the kit’s states.', { i: i + 1 }));
      if (typeof m.to !== 'string' || !ids.has(m.to) || m.to === m.from)
        throw new Invalid(tr('Move {i}: it goes to another of the kit’s states.', { i: i + 1 }));
      if (pairs.has(`${m.from}>${m.to}`))
        throw new Invalid(
          tr('Move {i}: from {from} to {to} is there already.', {
            i: i + 1,
            from: m.from,
            to: m.to,
          }),
        );
      pairs.add(`${m.from}>${m.to}`);
      const who = m.who as CustomKitSide;
      if (!SIDES.includes(who))
        throw new Invalid(tr('Move {i}: who is organization, customer or anyone.', { i: i + 1 }));
      return {
        from: m.from,
        to: m.to,
        label: words(m.label, tr('Move {i}’s label', { i: i + 1 }), 40),
        who,
      };
    });
    for (const id of ids)
      if (same(moves.filter((m) => m.from === id).map((m) => m.label)))
        throw new Invalid(tr('From {id}, each move has a label of its own.', { id }));

    if (k.adultsOnly !== undefined && typeof k.adultsOnly !== 'boolean')
      throw new Invalid(tr('adultsOnly is true or false.'));
    return {
      ok: true,
      def: {
        key,
        name: words(k.name, 'Its name', 40),
        description: words(k.description, 'Its description', 120, true),
        icon,
        fields,
        states,
        moves,
        // A card about money is never in a conversation with anyone under 18 (R29).
        adultsOnly: k.adultsOnly === true || fields.some((f) => f.type === 'amount'),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/** What a card of the kit holds, checked against it (a card's own kit, once it's sent). */
export function prepareCustomFields(
  shape: Pick<CustomKitShape, 'fields'>,
  raw: unknown,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  return cleanKitFields(shape.fields, raw);
}

/**
 * A card's fields after an app changes some: `null` takes an optional one away, and the rest
 * stay as they were.
 */
export function mergeCustomFields(
  shape: Pick<CustomKitShape, 'fields'>,
  current: Record<string, unknown>,
  change: unknown,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  if (!change || typeof change !== 'object' || Array.isArray(change))
    return { ok: false, error: tr('Send the fields to change.') };
  const known = new Set(shape.fields.map((f) => f.key));
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(change)) {
    if (!known.has(key)) return { ok: false, error: tr('The card has no “{key}”.', { key }) };
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return cleanKitFields(shape.fields, next);
}

// --- Reading a card -------------------------------------------------------------------------------

/** The field a card's main line comes from: its first required text, else its first text set. */
function titleField(shape: Pick<CustomKitShape, 'fields'>, fields: Record<string, unknown>) {
  const texts = shape.fields.filter((f) => f.type === 'text');
  const set = (f: KitField) => typeof fields[f.key] === 'string' && fields[f.key] !== '';
  return texts.find((f) => f.required && set(f)) ?? texts.find(set) ?? null;
}

/** The card's main line: what its main text field says, else the kit's name. */
export function customTitle(
  kit: { name: string } & Pick<CustomKitShape, 'fields'>,
  fields: Record<string, unknown>,
): string {
  const f = titleField(kit, fields);
  return f ? (fields[f.key] as string) : kit.name;
}

/** The card's other lines, labelled, as Caime's own cards show theirs. */
export function customDetails(
  card: Pick<CustomKitCard, 'def' | 'fields'>,
  opts: { now: Date; timeZone: string; locale: string },
): Array<{ key: string; label: string; value: string }> {
  const main = titleField(card.def, card.fields);
  return fieldDetails(card.def.fields, card.fields, opts, new Set(main ? [main.key] : []));
}

/** Where the card stands, as its kit names it. */
export function customState(card: Pick<CustomKitCard, 'def' | 'state'>): CustomKitState {
  return (
    card.def.states.find((s) => s.id === card.state) ?? {
      id: card.state,
      label: kitStateLabel(card.state),
      tone: 'neutral',
    }
  );
}

/** The moves someone on this side may make on the card now. */
export function customMoves(
  card: Pick<CustomKitCard, 'def' | 'state'>,
  organizationSide: boolean,
): CustomKitMove[] {
  return card.def.moves.filter(
    (m) =>
      m.from === card.state &&
      (m.who === 'anyone' || (m.who === 'organization') === organizationSide),
  );
}
