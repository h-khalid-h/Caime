/**
 * Connect Kit cards (PRD §41): what a card holds, where it can go next and who may take it there,
 * and how it reads. The server validates and moves cards with these functions and the app
 * renders them with the same ones, so a card reads the same on every device.
 */
import { formatAmount, formatWhenAt } from './format';
import type { Mode } from './intelligence';
import { KITS, type KitDef, type KitField, type KitId } from './kits';
import { dateFormat } from './locale';

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
  'checklist',
  'shared_album',
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
  checklist: 'plan',
  shared_album: 'share',
};

/** Who may move a card: whoever posted it, the others in the conversation, or anyone there. */
export type KitWho = 'creator' | 'others' | 'anyone';
export interface KitMove {
  to: string;
  /** The button: "Approve", "Mark paid". */
  label: string;
  who: KitWho;
}
const m = (to: string, label: string, who: KitWho): KitMove => ({ to, label, who });

/** From each state, the moves a card allows. A state with no moves is final. */
export const KIT_FLOWS: Record<CardKitId, Record<string, KitMove[]>> = {
  approval: {
    pending: [m('approved', 'Approve', 'others'), m('rejected', 'Reject', 'others')],
  },
  meeting: {
    proposed: [
      m('accepted', 'Accept', 'others'),
      m('declined', 'Decline', 'others'),
      m('cancelled', 'Cancel', 'creator'),
    ],
    accepted: [m('cancelled', 'Cancel', 'anyone')],
  },
  document_review: {
    requested: [
      m('in_review', 'Start review', 'others'),
      m('approved', 'Approve', 'others'),
      m('changes_requested', 'Ask for changes', 'others'),
    ],
    in_review: [
      m('approved', 'Approve', 'others'),
      m('changes_requested', 'Ask for changes', 'others'),
    ],
    changes_requested: [m('requested', 'Ready again', 'creator')],
  },
  order_status: {
    placed: [m('confirmed', 'Confirm', 'anyone'), m('cancelled', 'Cancel', 'anyone')],
    confirmed: [m('shipped', 'Shipped', 'anyone'), m('cancelled', 'Cancel', 'anyone')],
    shipped: [m('delivered', 'Delivered', 'anyone')],
  },
  delivery: {
    in_transit: [
      m('out_for_delivery', 'Out for delivery', 'anyone'),
      m('delivered', 'Delivered', 'anyone'),
      m('problem', 'Report a problem', 'anyone'),
    ],
    out_for_delivery: [
      m('delivered', 'Delivered', 'anyone'),
      m('problem', 'Report a problem', 'anyone'),
    ],
    problem: [m('in_transit', 'On its way again', 'anyone'), m('delivered', 'Delivered', 'anyone')],
  },
  invoice: {
    sent: [
      m('paid', 'Mark paid', 'anyone'),
      m('overdue', 'Mark overdue', 'creator'),
      m('void', 'Void', 'creator'),
    ],
    overdue: [m('paid', 'Mark paid', 'anyone'), m('void', 'Void', 'creator')],
  },
  purchase_order: {
    sent: [m('accepted', 'Accept', 'others'), m('cancelled', 'Cancel', 'creator')],
    accepted: [m('fulfilled', 'Fulfilled', 'anyone')],
  },
  payment_request: {
    requested: [m('paid', 'Mark paid', 'anyone'), m('declined', 'Decline', 'others')],
  },
  support_ticket: {
    open: [m('in_progress', 'Start', 'others'), m('resolved', 'Resolved', 'anyone')],
    in_progress: [
      m('waiting', 'Waiting on a reply', 'others'),
      m('resolved', 'Resolved', 'anyone'),
    ],
    waiting: [m('in_progress', 'Back on it', 'anyone'), m('resolved', 'Resolved', 'anyone')],
    resolved: [m('open', 'Reopen', 'anyone')],
  },
  appointment: {
    requested: [m('confirmed', 'Confirm', 'others'), m('cancelled', 'Cancel', 'anyone')],
    confirmed: [m('done', 'Done', 'anyone'), m('cancelled', 'Cancel', 'anyone')],
  },
  // A checklist has no buttons to press: it's done when everything on it is ticked.
  checklist: {},
  // Whoever made an album decides when it's full: closed, nobody adds to it.
  shared_album: {
    open: [m('closed', 'Close the album', 'creator')],
    closed: [m('open', 'Reopen', 'creator')],
  },
};

/** The moves this person may make on a card in this state. */
export function kitMoves(kit: KitId, state: string, isCreator: boolean): KitMove[] {
  if (!isCardKit(kit)) return [];
  return (KIT_FLOWS[kit][state] ?? []).filter(
    (move) => move.who === 'anyone' || (move.who === 'creator') === isCreator,
  );
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Waiting for an answer',
  in_transit: 'On its way',
  in_review: 'In review',
  in_progress: 'In progress',
  changes_requested: 'Changes asked for',
  out_for_delivery: 'Out for delivery',
  void: 'Voided',
  problem: 'Problem reported',
  waiting: 'Waiting on a reply',
};
const POSITIVE = new Set([
  'approved',
  'accepted',
  'paid',
  'delivered',
  'done',
  'resolved',
  'fulfilled',
  'confirmed',
]);
const NEGATIVE = new Set([
  'rejected',
  'declined',
  'cancelled',
  'void',
  'problem',
  'overdue',
  'changes_requested',
]);

export function kitStateLabel(state: string): string {
  const label = STATE_LABELS[state] ?? state.replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function kitStateTone(state: string): 'positive' | 'negative' | 'neutral' {
  return POSITIVE.has(state) ? 'positive' : NEGATIVE.has(state) ? 'negative' : 'neutral';
}

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
  if ('text' in op && !text) return { ok: false, error: 'Write something to add.' };
  if (text.length > CHECKLIST_ITEM_MAX)
    return { ok: false, error: `Keep an item under ${CHECKLIST_ITEM_MAX} characters.` };
  if (op.op === 'add') {
    if (items.length >= CHECKLIST_MAX_ITEMS)
      return { ok: false, error: `A list holds ${CHECKLIST_MAX_ITEMS} items.` };
    const item = { id: nextItemId(items), text, done: false, doneBy: null, addedBy: actor.userId };
    return { ok: true, items: [...items, item] };
  }
  const item = items.find((i) => i.id === op.itemId);
  if (!item) return { ok: false, error: 'That item isn’t on the list anymore.' };
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
      error: 'Only whoever added it, or made the list, can change it.',
      forbidden: true,
    };
  if (op.op === 'edit')
    return { ok: true, items: items.map((i) => (i.id === item.id ? { ...i, text } : i)) };
  return { ok: true, items: items.filter((i) => i.id !== item.id) };
}

type Cleaned = { value: unknown } | { error: string } | null;

function clean(field: KitField, raw: unknown): Cleaned {
  if (raw === undefined || raw === null || raw === '') return null;
  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'location': {
      if (typeof raw !== 'string') return { error: `${field.label}: write it as text.` };
      const text = raw.trim();
      if (!text) return null;
      const max = field.type === 'longtext' ? LIMITS.longtext : LIMITS.text;
      if (text.length > max) return { error: `${field.label}: keep it under ${max} characters.` };
      return { value: text };
    }
    case 'datetime': {
      const w = raw as Partial<KitWhen>;
      if (typeof w?.at !== 'string' || Number.isNaN(Date.parse(w.at)))
        return { error: `${field.label}: choose a time.` };
      return { value: { at: new Date(w.at).toISOString(), hasTime: w.hasTime === true } };
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return { error: `${field.label}: choose a date.` };
      if (Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))
        return { error: `${field.label}: choose a date.` };
      return { value: raw };
    }
    case 'amount': {
      const a = raw as Partial<KitAmount>;
      if (
        typeof a?.value !== 'number' ||
        !Number.isFinite(a.value) ||
        a.value <= 0 ||
        a.value > 1e12
      )
        return { error: `${field.label}: enter an amount.` };
      const currency =
        typeof a.currency === 'string' && /^[A-Z]{3}$/.test(a.currency) ? a.currency : null;
      return { value: { value: Math.round(a.value * 100) / 100, currency } };
    }
    case 'options':
      return field.choices?.some((c) => c.value === raw)
        ? { value: raw }
        : { error: `${field.label}: pick one of the choices.` };
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
        return { error: `${field.label}: one line each.` };
      const lines = (texts as string[]).map((x) => x.trim()).filter(Boolean);
      if (!lines.length) return null;
      if (lines.length > CHECKLIST_MAX_ITEMS)
        return { error: `${field.label}: up to ${CHECKLIST_MAX_ITEMS}.` };
      if (lines.some((l) => l.length > CHECKLIST_ITEM_MAX))
        return { error: `${field.label}: keep each under ${CHECKLIST_ITEM_MAX} characters.` };
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
      return { error: `${field.label} isn’t supported yet.` };
  }
}

/** Checks a card's fields against its kit and keeps only what the kit defines. */
export function prepareKitFields(
  kit: unknown,
  raw: unknown,
):
  | { ok: true; kit: CardKitId; def: KitDef; fields: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!isCardKit(kit)) return { ok: false, error: 'That card isn’t available.' };
  const def = KITS[kit];
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, unknown> = {};
  for (const field of def.fields) {
    const result = clean(field, input[field.key]);
    if (result === null) {
      if (field.required) return { ok: false, error: `${field.label} is needed.` };
      continue;
    }
    if ('error' in result) return { ok: false, error: result.error };
    fields[field.key] = result.value;
  }
  return { ok: true, kit, def, fields };
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
      return [`Order ${asText(fields.reference)}`, asText(fields.summary)]
        .filter(Boolean)
        .join(' · ');
    case 'invoice':
      return `Invoice ${asText(fields.reference)}`;
    case 'purchase_order':
      return `PO ${asText(fields.reference)}`;
    case 'delivery':
      return [asText(fields.carrier), asText(fields.tracking)].filter(Boolean).join(' ');
    case 'payment_request': {
      const note = asText(fields.note);
      return note
        ? `${amountText(fields.amount, locale)} for ${note}`
        : amountText(fields.amount, locale);
    }
    default:
      return asText(fields.title) || KITS[kit].name;
  }
}

/** Fields the headline already says. */
const IN_HEADLINE: Partial<Record<KitId, string[]>> = {
  order_status: ['reference', 'summary'],
  invoice: ['reference'],
  purchase_order: ['reference'],
  delivery: ['carrier', 'tracking'],
  payment_request: ['amount', 'note'],
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
): Array<{ label: string; value: string }> {
  // A checklist's items are the card itself, not a detail of it.
  const skip = new Set(['title', 'items', ...(IN_HEADLINE[kit] ?? [])]);
  const out: Array<{ label: string; value: string }> = [];
  for (const field of KITS[kit].fields) {
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
            ? dateFormat(opts.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                new Date(`${v}T12:00:00Z`),
              )
            : '';
        break;
      case 'amount':
        value = amountText(v, opts.locale);
        break;
      case 'options':
        value = field.choices?.find((c) => c.value === v)?.label ?? String(v);
        break;
      default:
        value = asText(v);
    }
    if (value) out.push({ label: field.label, value });
  }
  return out;
}
