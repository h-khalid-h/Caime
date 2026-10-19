/**
 * Connect Kit cards (PRD §41): what a card holds, where it can go next and who may take it there,
 * and how it reads. The server validates and moves cards with these functions and the app
 * renders them with the same ones, so a card reads the same on every device.
 */
import type { AppointmentBooking, PlacedOrder } from './booking';
import { formatAmount, formatWhenAt, minorUnits, roundAmount } from './format';
import { msg, tr, trn } from './i18n';
import type { Mode } from './intelligence';
import { KITS, type KitDef, type KitField, type KitId } from './kits';
import { dateFormat } from './locale';
import { type PaysShare, payDirection } from './payments';
import { isRepeat } from './repeat';
import { zonedParts } from './time';

/** The kits posted as cards. Poll is posted as a poll message, and location as a location. */
export const CARD_KITS = [
  'approval',
  'meeting',
  'document_review',
  'order_status',
  'delivery',
  'invoice',
  'purchase_order',
  'payment_request',
  'support_ticket',
  'appointment',
  'form',
  'checklist',
  'shared_album',
  'split',
] as const satisfies readonly KitId[];
export type CardKitId = (typeof CARD_KITS)[number];

export function isCardKit(id: unknown): id is CardKitId {
  return typeof id === 'string' && (CARD_KITS as readonly string[]).includes(id);
}

/** What kind of message each card is (PRD §18). */
export const KIT_MODES: Record<CardKitId, Mode> = {
  approval: 'decide',
  meeting: 'plan',
  document_review: 'request',
  order_status: 'track',
  delivery: 'track',
  invoice: 'pay',
  purchase_order: 'request',
  payment_request: 'pay',
  support_ticket: 'request',
  appointment: 'plan',
  form: 'request',
  checklist: 'plan',
  shared_album: 'share',
  split: 'pay',
};

/**
 * Who may move a card: whoever posted it, the others in the conversation, or anyone there; on
 * a Pay card (R62), whoever pays or whoever is paid, whichever side sent it.
 */
export type KitWho = 'creator' | 'others' | 'anyone' | 'payer' | 'payee';
export interface KitMove {
  to: string;
  /** The button: "Approve", "Mark paid", as a key (shown through `tr`). */
  label: string;
  who: KitWho;
}
const m = (to: string, label: string, who: KitWho): KitMove => ({ to, label, who });

/** From each state, the moves a card allows. A state with no moves is final. */
export const KIT_FLOWS: Record<CardKitId, Record<string, KitMove[]>> = {
  approval: {
    pending: [m('approved', msg('Approve'), 'others'), m('rejected', msg('Reject'), 'others')],
  },
  meeting: {
    proposed: [
      m('accepted', msg('Accept'), 'others'),
      m('declined', msg('Decline'), 'others'),
      m('cancelled', msg('Cancel'), 'creator'),
    ],
    accepted: [m('cancelled', msg('Cancel'), 'anyone')],
  },
  document_review: {
    requested: [
      m('in_review', msg('Start review'), 'others'),
      m('approved', msg('Approve'), 'others'),
      m('changes_requested', msg('Ask for changes'), 'others'),
    ],
    in_review: [
      m('approved', msg('Approve'), 'others'),
      m('changes_requested', msg('Ask for changes'), 'others'),
    ],
    changes_requested: [m('requested', msg('Ready again'), 'creator')],
  },
  order_status: {
    placed: [m('confirmed', msg('Confirm'), 'anyone'), m('cancelled', msg('Cancel'), 'anyone')],
    // Ready to collect (R60), or on its way: whichever the order is.
    confirmed: [
      m('ready', msg('Ready to collect'), 'anyone'),
      m('shipped', msg('Shipped'), 'anyone'),
      m('cancelled', msg('Cancel'), 'anyone'),
    ],
    ready: [m('delivered', msg('Collected'), 'anyone')],
    shipped: [m('delivered', msg('Delivered'), 'anyone')],
  },
  delivery: {
    in_transit: [
      m('out_for_delivery', msg('Out for delivery'), 'anyone'),
      m('delivered', msg('Delivered'), 'anyone'),
      m('problem', msg('Report a problem'), 'anyone'),
    ],
    out_for_delivery: [
      m('delivered', msg('Delivered'), 'anyone'),
      m('problem', msg('Report a problem'), 'anyone'),
    ],
    problem: [
      m('in_transit', msg('On its way again'), 'anyone'),
      m('delivered', msg('Delivered'), 'anyone'),
    ],
  },
  invoice: {
    sent: [
      m('paid', msg('Mark paid'), 'anyone'),
      m('overdue', msg('Mark overdue'), 'creator'),
      m('void', msg('Void'), 'creator'),
    ],
    overdue: [m('paid', msg('Mark paid'), 'anyone'), m('void', msg('Void'), 'creator')],
  },
  purchase_order: {
    sent: [m('accepted', msg('Accept'), 'others'), m('cancelled', msg('Cancel'), 'creator')],
    accepted: [m('fulfilled', msg('Fulfilled'), 'anyone')],
  },
  // Pay (R62): the payer says it's sent, the payee says it arrived; each side's own word.
  payment_request: {
    requested: [
      m('sent', msg('I’ve paid'), 'payer'),
      m('paid', msg('Mark received'), 'payee'),
      m('declined', msg('Decline'), 'payer'),
      m('cancelled', msg('Cancel'), 'payee'),
    ],
    sent: [
      m('paid', msg('Received'), 'payee'),
      m('not_received', msg('Not received yet'), 'payee'),
    ],
    not_received: [
      m('sent', msg('Sent again'), 'payer'),
      m('paid', msg('Received'), 'payee'),
      m('cancelled', msg('Cancel'), 'anyone'),
    ],
  },
  support_ticket: {
    open: [m('in_progress', msg('Start'), 'others'), m('resolved', msg('Resolved'), 'anyone')],
    in_progress: [
      m('waiting', msg('Waiting on a reply'), 'others'),
      m('resolved', msg('Resolved'), 'anyone'),
    ],
    waiting: [
      m('in_progress', msg('Back on it'), 'anyone'),
      m('resolved', msg('Resolved'), 'anyone'),
    ],
    resolved: [m('open', msg('Reopen'), 'anyone')],
  },
  appointment: {
    requested: [m('confirmed', msg('Confirm'), 'others'), m('cancelled', msg('Cancel'), 'anyone')],
    confirmed: [m('done', msg('Done'), 'anyone'), m('cancelled', msg('Cancel'), 'anyone')],
  },
  // A form has no buttons either (M16 H5): it's answered when its customer sends their answers.
  form: {},
  // A checklist has no buttons to press: it's done when everything on it is ticked.
  checklist: {},
  // Whoever made an album decides when it's full: closed, nobody adds to it.
  shared_album: {
    open: [m('closed', msg('Close the album'), 'creator')],
    closed: [m('open', msg('Reopen'), 'creator')],
  },
  // A split has no buttons either: it's settled when every share is.
  split: {},
};

/**
 * Who asked for a card as it stands (M16 F5): whoever suggested a meeting's or an appointment's
 * time it now has, else its sender. The other side answers it, and the asker may take it back.
 */
export function askedBy(card: { proposedBy?: unknown }, senderId: string | null): string | null {
  return typeof card.proposedBy === 'string' ? card.proposedBy : senderId;
}

/** Where a meeting or an appointment may take another time from, and where it goes (M16 F5). */
export const RETIMES = {
  meeting: { from: ['proposed', 'accepted'], to: 'proposed' },
  appointment: { from: ['requested', 'confirmed'], to: 'requested' },
} as const;

/** Why a card can't take another time (M16 F5). */
export type RetimeBlock = 'kind' | 'state' | 'series' | 'invitation' | 'moved';

/**
 * Why a card can't take another time, or null when it can (M16 F5): a meeting or an appointment,
 * asked or agreed, at one time (each time of a series keeps its own), not someone's calendar
 * invitation (theirs to move), not moved to its own space (its copy there is the one). A booking
 * from a catalog moves too, to an open time of its catalog (M16 F5b: the server checks it).
 */
export function retimeBlock(card: {
  kit?: unknown;
  state?: unknown;
  fields?: Record<string, unknown> | null;
  invitation?: unknown;
  movedTo?: unknown;
}): RetimeBlock | null {
  if (card.kit !== 'meeting' && card.kit !== 'appointment') return 'kind';
  if (!(RETIMES[card.kit].from as readonly unknown[]).includes(card.state)) return 'state';
  if (isRepeat(card.fields?.repeat)) return 'series';
  if (card.invitation) return 'invitation';
  if (card.movedTo) return 'moved';
  return null;
}

/**
 * The moves this person may make on a card in this state. A Pay card's sides are its payer and
 * its payee (R62): its sender pays when they said they're paying, and is paid when they asked.
 */
export function kitMoves(
  kit: KitId,
  state: string,
  isCreator: boolean,
  fields?: Record<string, unknown>,
): KitMove[] {
  if (!isCardKit(kit)) return [];
  const creatorPays = fields?.direction === 'send';
  // An agreed meeting or appointment that repeats (R58) is cancelled a time at a time: the
  // rest stay.
  const oneTime =
    ((kit === 'meeting' && state === 'accepted') ||
      (kit === 'appointment' && state === 'confirmed')) &&
    isRepeat(fields?.repeat);
  return (KIT_FLOWS[kit][state] ?? [])
    .filter((move) => {
      if (move.who === 'anyone') return true;
      if (move.who === 'payer') return isCreator === creatorPays;
      if (move.who === 'payee') return isCreator !== creatorPays;
      return (move.who === 'creator') === isCreator;
    })
    .map((move) =>
      oneTime && move.to === 'cancelled' ? { ...move, label: msg('Cancel this one') } : move,
    );
}

export interface PaySides {
  payerId: string | null;
  payeeId: string | null;
}

/**
 * Who pays a Pay card and who is paid, as people: a share's are named on it (R62); one that
 * pays is paid by its sender to the other side; an ask is paid to its sender by the other side,
 * or in a group by whoever said they'd paid it. Unknown is null (a group's ask marked received
 * without anyone saying they'd paid). `otherId` is the other person of a one-to-one, else null.
 */
export function paySides(
  card: {
    fields?: Record<string, unknown>;
    share?: PaysShare | null;
    history?: Array<{ state?: string; by?: string }>;
  },
  senderId: string | null,
  otherId: string | null,
): PaySides {
  if (card.share) return { payerId: senderId, payeeId: card.share.payeeId };
  if (payDirection(card.fields) === 'send') return { payerId: senderId, payeeId: otherId };
  const said = [...(card.history ?? [])].reverse().find((h) => h.state === 'sent')?.by ?? null;
  return { payerId: otherId ?? said, payeeId: senderId };
}

/** Where a new card starts: its kit's first state, or "sent" for a Pay card that pays (R62). */
export function initialKitState(kit: CardKitId, fields: Record<string, unknown>): string {
  if (kit === 'payment_request' && fields.direction === 'send') return 'sent';
  return KITS[kit].states[0] ?? '';
}

// A card's states and their tones live in `kit-states.ts`, a light module a screen that lists
// cards (the Business inbox's Orders) imports without the whole of this one; re-exported here.
export { kitStateLabel, kitStateTone } from './kit-states';

// --- Fields -------------------------------------------------------------------------------------

/** How each field type is stored on a card. */
export interface KitWhen {
  at: string;
  hasTime: boolean;
}
export interface KitAmount {
  value: number;
  currency: string | null;
}

const LIMITS = { text: 200, longtext: 2000 } as const;

// --- Checklists ---------------------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Who ticked it. */
  doneBy: string | null;
  /** Who put it on the list; null for the list's first items. */
  addedBy: string | null;
}

export const CHECKLIST_MAX_ITEMS = 100;
export const CHECKLIST_ITEM_MAX = 200;

export function checklistItems(fields: Record<string, unknown>): ChecklistItem[] {
  return Array.isArray(fields.items) ? (fields.items as ChecklistItem[]) : [];
}

/** Done once there's something on it and all of it is ticked. */
export function checklistState(items: ChecklistItem[]): 'open' | 'done' {
  return items.length > 0 && items.every((i) => i.done) ? 'done' : 'open';
}

export type ChecklistOp =
  | { op: 'add'; text: string }
  | { op: 'toggle'; itemId: string; done: boolean }
  | { op: 'edit'; itemId: string; text: string }
  | { op: 'remove'; itemId: string };

const nextItemId = (items: ChecklistItem[]) =>
  `i${1 + items.reduce((n, i) => Math.max(n, Number(i.id.slice(1)) || 0), 0)}`;

/**
 * One change to a checklist, by someone in the conversation. Anyone there ticks and adds;
 * changing or removing an item is for whoever added it, or whoever made the list.
 */
export function applyChecklistOp(
  items: ChecklistItem[],
  op: ChecklistOp,
  actor: { userId: string; isCreator: boolean },
): { ok: true; items: ChecklistItem[] } | { ok: false; error: string; forbidden?: true } {
  const text = 'text' in op ? op.text.trim() : '';
  if ('text' in op && !text) return { ok: false, error: tr('Write something to add.') };
  if (text.length > CHECKLIST_ITEM_MAX)
    return {
      ok: false,
      error: tr('Keep an item under {max} characters.', { max: CHECKLIST_ITEM_MAX }),
    };
  if (op.op === 'add') {
    if (items.length >= CHECKLIST_MAX_ITEMS)
      return {
        ok: false,
        error: tr('A list holds {max} items.', { max: CHECKLIST_MAX_ITEMS }),
      };
    const item = { id: nextItemId(items), text, done: false, doneBy: null, addedBy: actor.userId };
    return { ok: true, items: [...items, item] };
  }
  const item = items.find((i) => i.id === op.itemId);
  if (!item) return { ok: false, error: tr('That item isn’t on the list any more.') };
  if (op.op === 'toggle')
    return {
      ok: true,
      items: items.map((i) =>
        i.id === item.id ? { ...i, done: op.done, doneBy: op.done ? actor.userId : null } : i,
      ),
    };
  const mayChange = actor.isCreator || item.addedBy === actor.userId;
  if (!mayChange)
    return {
      ok: false,
      error: tr('Only whoever added it, or made the list, can change it.'),
      forbidden: true,
    };
  if (op.op === 'edit')
    return { ok: true, items: items.map((i) => (i.id === item.id ? { ...i, text } : i)) };
  return { ok: true, items: items.filter((i) => i.id !== item.id) };
}

// --- Splits (R38) -------------------------------------------------------------------------------

/**
 * One person's part of what someone else paid. A split is a record of who owes whom and whether
 * it's been settled between them; Caime holds and moves nothing (R38).
 */
export interface SplitShare {
  userId: string;
  amount: number;
  /** When it was marked settled, by the person who owes it or by whoever paid. */
  settledAt: string | null;
  settledBy: string | null;
}

export function splitShares(fields: Record<string, unknown>): SplitShare[] {
  return Array.isArray(fields.shares) ? (fields.shares as SplitShare[]) : [];
}

/**
 * Everyone's equal part of what was paid, one share per person other than the payer, each
 * rounded as the currency keeps it; whatever rounding leaves over stays with the payer, so the
 * shares never add up to more than was paid.
 */
export function shareOut(
  total: KitAmount,
  payerId: string,
  memberIds: readonly string[],
): SplitShare[] {
  const others = memberIds.filter((id) => id !== payerId);
  const heads = others.length + 1;
  const scale = 10 ** minorUnits(total.currency);
  const part = Math.floor(Math.round(total.value * scale) / heads) / scale;
  return others.map((userId) => ({ userId, amount: part, settledAt: null, settledBy: null }));
}

/** Settled once there's someone to settle and everyone has. */
export function splitState(shares: SplitShare[]): 'open' | 'settled' {
  return shares.length > 0 && shares.every((s) => s.settledAt) ? 'settled' : 'open';
}

export interface SplitOp {
  op: 'settle' | 'unsettle';
  userId: string;
}

/**
 * One change to a split: a share is marked settled, or not after all, by the person who owes it
 * or by whoever paid. Nobody else's share is anyone's to touch.
 */
export function applySplitOp(
  shares: SplitShare[],
  op: SplitOp,
  actor: { userId: string; isCreator: boolean; at: string },
): { ok: true; shares: SplitShare[] } | { ok: false; error: string; forbidden?: true } {
  const share = shares.find((s) => s.userId === op.userId);
  if (!share) return { ok: false, error: tr('That share isn’t on this split.') };
  if (!actor.isCreator && share.userId !== actor.userId)
    return {
      ok: false,
      error: tr('Only who owes it, or who paid, can settle a share.'),
      forbidden: true,
    };
  const settled = op.op === 'settle';
  if (settled === Boolean(share.settledAt)) return { ok: true, shares };
  return {
    ok: true,
    shares: shares.map((s) =>
      s.userId === share.userId
        ? { ...s, settledAt: settled ? actor.at : null, settledBy: settled ? actor.userId : null }
        : s,
    ),
  };
}

type Cleaned = { value: unknown } | { error: string } | null;

function clean(field: KitField, raw: unknown): Cleaned {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'location': {
      if (typeof raw !== 'string')
        return { error: tr('{label}: write it as text.', { label: field.label }) };
      const text = raw.trim();
      if (!text) return null;
      const max = field.type === 'longtext' ? LIMITS.longtext : LIMITS.text;
      if (text.length > max)
        return {
          error: tr('{label}: keep it under {max} characters.', { label: field.label, max }),
        };
      return { value: text };
    }
    case 'datetime': {
      const w = raw as Partial<KitWhen>;
      if (typeof w?.at !== 'string' || Number.isNaN(Date.parse(w.at)))
        return { error: tr('{label}: choose a time.', { label: field.label }) };
      return { value: { at: new Date(w.at).toISOString(), hasTime: w.hasTime === true } };
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return { error: tr('{label}: choose a date.', { label: field.label }) };
      if (Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))
        return { error: tr('{label}: choose a date.', { label: field.label }) };
      return { value: raw };
    }
    case 'amount': {
      const a = raw as Partial<KitAmount>;
      const currency =
        typeof a?.currency === 'string' && /^[A-Z]{3}$/.test(a.currency) ? a.currency : null;
      // As its currency keeps it (KWD 12.345, JPY 1200), and more than nothing once it is.
      const value =
        typeof a?.value === 'number' && Number.isFinite(a.value)
          ? roundAmount(a.value, currency)
          : Number.NaN;
      if (!(value > 0) || value > 1e12)
        return { error: tr('{label}: enter an amount.', { label: field.label }) };
      return { value: { value, currency } };
    }
    case 'options':
      return field.choices?.some((c) => c.value === raw)
        ? { value: raw }
        : { error: tr('{label}: pick one of the choices.', { label: field.label }) };
    case 'items': {
      // Lines as typed, or items already made from them: checking twice changes nothing.
      const texts = Array.isArray(raw)
        ? raw.map((x) =>
            typeof x === 'string'
              ? x
              : typeof (x as { text?: unknown } | null)?.text === 'string'
                ? (x as { text: string }).text
                : null,
          )
        : null;
      if (!texts || texts.some((x) => x === null))
        return { error: tr('{label}: one line each.', { label: field.label }) };
      const lines = (texts as string[]).map((x) => x.trim()).filter(Boolean);
      if (!lines.length) return null;
      if (lines.length > CHECKLIST_MAX_ITEMS)
        return {
          error: tr('{label}: up to {max}.', {
            label: field.label,
            max: CHECKLIST_MAX_ITEMS,
          }),
        };
      if (lines.some((l) => l.length > CHECKLIST_ITEM_MAX))
        return {
          error: tr('{label}: keep each under {max} characters.', {
            label: field.label,
            max: CHECKLIST_ITEM_MAX,
          }),
        };
      return {
        value: lines.map(
          (text, i): ChecklistItem => ({
            id: `i${i + 1}`,
            text,
            done: false,
            doneBy: null,
            addedBy: null,
          }),
        ),
      };
    }
    default:
      return { error: tr('{label} isn’t supported yet.', { label: field.label }) };
  }
}

/** Checks a card's fields against its kit and keeps only what the kit defines. */
export function prepareKitFields(
  kit: unknown,
  raw: unknown,
):
  | { ok: true; kit: CardKitId; def: KitDef; fields: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!isCardKit(kit)) return { ok: false, error: tr('That card isn’t available.') };
  const def = KITS[kit];
  const checked = cleanKitFields(def.fields, raw);
  return checked.ok ? { ok: true, kit, def, fields: checked.fields } : checked;
}

/** Checks fields against a list of them (a kit's, or a card's own) and keeps only those. */
export function cleanKitFields(
  defs: readonly KitField[],
  raw: unknown,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, unknown> = {};
  for (const field of defs) {
    const result = clean(field, input[field.key]);
    if (result === null) {
      if (field.required)
        return { ok: false, error: tr('{label} is needed.', { label: field.label }) };
      continue;
    }
    if ('error' in result) return { ok: false, error: result.error };
    fields[field.key] = result.value;
  }
  return { ok: true, fields };
}

// --- Reading a card -----------------------------------------------------------------------------

const asText = (v: unknown) => (typeof v === 'string' ? v : '');

function amountText(v: unknown, locale: string): string {
  const a = v as Partial<KitAmount> | undefined;
  return typeof a?.value === 'number' ? formatAmount(a.value, a.currency ?? null, locale) : '';
}

/** The card's main line: "Venue walkthrough", "Invoice INV-204", "EGP 1,200.00 for the tickets". */
export function kitHeadline(kit: KitId, fields: Record<string, unknown>, locale = 'en'): string {
  switch (kit) {
    case 'order_status':
      return [tr('Order {asText}', { asText: asText(fields.reference) }), asText(fields.summary)]
        .filter(Boolean)
        .join(' · ');
    case 'invoice':
      return tr('Invoice {asText}', { asText: asText(fields.reference) });
    case 'purchase_order':
      return tr('PO {asText}', { asText: asText(fields.reference) });
    case 'delivery':
      return [asText(fields.carrier), asText(fields.tracking)].filter(Boolean).join(' ');
    case 'payment_request': {
      const note = asText(fields.note);
      return note
        ? tr('{amountText} for {note}', { amountText: amountText(fields.amount, locale), note })
        : amountText(fields.amount, locale);
    }
    default:
      return asText(fields.title) || tr(KITS[kit].name);
  }
}

/** Fields the headline already says. */
const IN_HEADLINE: Partial<Record<KitId, string[]>> = {
  order_status: ['reference', 'summary'],
  invoice: ['reference'],
  purchase_order: ['reference'],
  delivery: ['carrier', 'tracking'],
  // The direction is the card's label and buttons; nothing to repeat.
  payment_request: ['amount', 'note', 'direction'],
};

function whenText(v: unknown, now: Date, timeZone: string, locale: string): string {
  const w = v as Partial<KitWhen> | undefined;
  if (typeof w?.at !== 'string') return '';
  return formatWhenAt(w.at, w.hasTime === true, now, timeZone, locale);
}

/** The card's other lines, labelled: [{ label: "When", value: "Fri 3:00 PM" }]. */
export function kitDetails(
  kit: KitId,
  fields: Record<string, unknown>,
  opts: { now: Date; timeZone: string; locale: string },
): Array<{ key: string; label: string; value: string }> {
  // A checklist's items are the card itself, not a detail of it.
  return fieldDetails(
    KITS[kit].fields,
    fields,
    opts,
    new Set(['title', 'items', ...(IN_HEADLINE[kit] ?? [])]),
  );
}

/**
 * What an order placed from a catalog says beyond its summary and total (R60): how it's had,
 * and for a delivery where to (R92), as the customer's place read when it was placed.
 */
export function orderDetails(
  order: PlacedOrder | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!order?.fulfilment) return [];
  return [
    {
      key: 'fulfilment',
      label: tr('How'),
      value: order.fulfilment === 'pickup' ? tr('Pickup') : tr('Delivery'),
    },
    ...(order.fulfilment === 'delivery' && order.deliverTo
      ? [{ key: 'deliverTo', label: tr('Deliver to'), value: order.deliverTo }]
      : []),
  ];
}

/**
 * What an appointment booked from a catalog says of it (R58): the item and its length, how
 * many, and the price as it was then. Nothing of who on the team does it: that's the team's.
 */
export function bookingDetails(
  booking: AppointmentBooking | null | undefined,
  locale: string,
): Array<{ key: string; label: string; value: string }> {
  if (!booking || typeof booking.name !== 'string') return [];
  const out: Array<{ key: string; label: string; value: string }> = [];
  out.push({
    key: 'booking',
    label: tr('Booked'),
    value:
      booking.unit === 'minutes' && booking.minutes
        ? `${booking.name} · ${tr('{minutes} min', { minutes: booking.minutes })}`
        : booking.name,
  });
  if (booking.unit === 'days')
    out.push({
      key: 'quantity',
      label: tr('Stay'),
      value: trn(booking.quantity, '{n} day', '{n} days'),
    });
  else if (booking.quantity > 1)
    out.push({
      key: 'quantity',
      label: tr('How many'),
      value: tr('For {n}', { n: booking.quantity }),
    });
  if (booking.price)
    out.push({
      key: 'price',
      label: tr('Price'),
      value: formatAmount(booking.price.value, booking.price.currency, locale),
    });
  return out;
}

/** A length in minutes: "50 min", "2 h", "2 h 15 min". */
function lengthText(v: unknown): string {
  const m = Math.round(Number(v));
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return tr('{n} min', { n: m });
  return m % 60
    ? tr('{hours} h {minutes} min', { hours: Math.floor(m / 60), minutes: m % 60 })
    : tr('{n} h', { n: m / 60 });
}

/** Fields as a card's labelled lines, but those the card already says elsewhere. */
export function fieldDetails(
  defs: readonly KitField[],
  fields: Record<string, unknown>,
  opts: { now: Date; timeZone: string; locale: string },
  skip: ReadonlySet<string>,
): Array<{ key: string; label: string; value: string }> {
  const out: Array<{ key: string; label: string; value: string }> = [];
  for (const field of defs) {
    if (skip.has(field.key) || fields[field.key] === undefined) continue;
    const v = fields[field.key];
    let value = '';
    switch (field.type) {
      case 'datetime':
        value = whenText(v, opts.now, opts.timeZone, opts.locale);
        break;
      case 'date':
        value =
          typeof v === 'string'
            ? dateFormat(opts.locale, {
                day: 'numeric',
                month: 'short',
                // Another year says which.
                ...(v.slice(0, 4) !== String(zonedParts(opts.now, opts.timeZone).year)
                  ? { year: 'numeric' as const }
                  : {}),
                timeZone: 'UTC',
              }).format(new Date(`${v}T12:00:00Z`))
            : '';
        break;
      case 'amount':
        value = amountText(v, opts.locale);
        break;
      case 'options': {
        const choice = field.choices?.find((c) => c.value === v);
        // A length no choice names (an invitation's 50 minutes, M16 F4) is said as one.
        value = choice
          ? tr(choice.label)
          : field.key === 'durationMinutes'
            ? lengthText(v)
            : tr(String(v));
        break;
      }
      default:
        value = asText(v);
    }
    // A label is a key, as the kit names it: shown in the reader's language.
    if (value) out.push({ key: field.key, label: tr(field.label), value });
  }
  return out;
}
