/**
 * Connect Kits (PRD §41, §88; PRODUCT-REVIEW R19): small action modules that appear only where
 * they fit the relationship. A vendor conversation offers Order, Delivery and Invoice; a
 * manager offers Approval and Meeting; family offers Location and Album. The composer's "+" can
 * only reach kits through `kitsFor`, which is the engineering form of "contextual, not a
 * marketplace".
 */

import { msg } from './i18n';
import type { Sphere } from './taxonomy';

export const KIT_IDS = [
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
  'location',
  'shared_album',
  'poll',
  'checklist',
  'split',
] as const;
export type KitId = (typeof KIT_IDS)[number];

export type KitFieldType =
  | 'text'
  | 'longtext'
  | 'datetime'
  | 'date'
  | 'amount'
  | 'options'
  | 'location'
  /** A list of short lines, each its own item: a checklist's things to do. */
  | 'items';

export interface KitField {
  key: string;
  label: string;
  type: KitFieldType;
  required?: boolean;
  placeholder?: string;
  /** For `options`: the one value to pick. */
  choices?: Array<{ value: number | string; label: string }>;
}

export interface KitDef {
  id: KitId;
  name: string;
  description: string;
  /** Lucide icon name. */
  icon: string;
  /** Spheres where the kit is offered; `null` means every relationship. */
  spheres: Sphere[] | null;
  /** Offered in group conversations too. */
  groups: boolean;
  /** Never offered to or by under-18 accounts. */
  adultsOnly?: boolean;
  fields: KitField[];
  /** Status values the card moves through; the first is the initial state. */
  states: string[];
}

export const KITS: Record<KitId, KitDef> = {
  approval: {
    id: 'approval',
    name: msg('Approval'),
    description: msg('Ask for a yes or no, with a record of the answer'),
    icon: 'badge-check',
    spheres: ['work', 'customer', 'vendor', 'professional', 'organization'],
    groups: true,
    fields: [
      { key: 'title', label: msg('What needs approval'), type: 'text', required: true },
      { key: 'details', label: msg('Details'), type: 'longtext' },
      { key: 'due', label: msg('Needed by'), type: 'datetime' },
    ],
    states: ['pending', 'approved', 'rejected'],
  },
  meeting: {
    id: 'meeting',
    name: msg('Meeting'),
    description: msg('Propose a time to meet'),
    icon: 'calendar-clock',
    spheres: null,
    groups: true,
    fields: [
      { key: 'title', label: msg('Title'), type: 'text', required: true },
      { key: 'start', label: msg('When'), type: 'datetime', required: true },
      {
        key: 'durationMinutes',
        label: msg('Duration'),
        type: 'options',
        choices: [
          { value: 15, label: msg('15 min') },
          { value: 30, label: msg('30 min') },
          { value: 45, label: msg('45 min') },
          { value: 60, label: msg('1 hour') },
          { value: 90, label: msg('1½ hours') },
        ],
      },
      { key: 'place', label: msg('Where'), type: 'text', placeholder: msg('Place or link') },
    ],
    states: ['proposed', 'accepted', 'declined', 'cancelled'],
  },
  document_review: {
    id: 'document_review',
    name: msg('Review'),
    description: msg('Ask someone to review a document'),
    icon: 'file-check',
    spheres: ['work', 'customer', 'vendor', 'professional'],
    groups: true,
    fields: [
      { key: 'title', label: msg('Document'), type: 'text', required: true },
      { key: 'due', label: msg('Review by'), type: 'datetime' },
    ],
    states: ['requested', 'in_review', 'approved', 'changes_requested'],
  },
  order_status: {
    id: 'order_status',
    name: msg('Order'),
    description: msg('Share an order and its status'),
    icon: 'package',
    spheres: ['customer', 'vendor', 'organization'],
    groups: false,
    // It says what it cost: like every card about money, never where someone under 18 is.
    adultsOnly: true,
    fields: [
      // Optional (R60): an order placed from a catalog gets its number from the server.
      { key: 'reference', label: msg('Order number'), type: 'text' },
      { key: 'summary', label: msg('What was ordered'), type: 'text' },
      { key: 'amount', label: msg('Total'), type: 'amount' },
    ],
    states: ['placed', 'confirmed', 'ready', 'shipped', 'delivered', 'cancelled'],
  },
  delivery: {
    id: 'delivery',
    name: msg('Delivery'),
    description: msg('Track a delivery'),
    icon: 'truck',
    spheres: ['customer', 'vendor', 'service_provider', 'organization'],
    groups: false,
    fields: [
      { key: 'carrier', label: msg('Carrier'), type: 'text' },
      { key: 'tracking', label: msg('Tracking number'), type: 'text', required: true },
      { key: 'eta', label: msg('Expected'), type: 'date' },
    ],
    states: ['in_transit', 'out_for_delivery', 'delivered', 'problem'],
  },
  invoice: {
    id: 'invoice',
    name: msg('Invoice'),
    description: msg('Send or track an invoice'),
    icon: 'receipt',
    spheres: ['customer', 'vendor', 'service_provider', 'professional', 'organization'],
    groups: false,
    adultsOnly: true,
    fields: [
      { key: 'reference', label: msg('Invoice number'), type: 'text', required: true },
      { key: 'amount', label: msg('Amount'), type: 'amount', required: true },
      { key: 'due', label: msg('Due'), type: 'date' },
    ],
    states: ['sent', 'paid', 'overdue', 'void'],
  },
  purchase_order: {
    id: 'purchase_order',
    name: msg('Purchase order'),
    description: msg('Raise a purchase order'),
    icon: 'clipboard-list',
    spheres: ['vendor', 'organization'],
    groups: false,
    adultsOnly: true,
    fields: [
      { key: 'reference', label: msg('PO number'), type: 'text', required: true },
      { key: 'summary', label: msg('Items'), type: 'longtext' },
      { key: 'amount', label: msg('Total'), type: 'amount' },
    ],
    states: ['sent', 'accepted', 'fulfilled', 'cancelled'],
  },
  // Pay (R62): ask to be paid, or say you're paying; either way a record, never a transfer.
  payment_request: {
    id: 'payment_request',
    name: msg('Pay'),
    description: msg('Ask to be paid, or say you’re paying'),
    icon: 'hand-coins',
    spheres: null,
    groups: true,
    adultsOnly: true,
    fields: [
      {
        key: 'direction',
        label: msg('Which way'),
        type: 'options',
        choices: [
          { value: 'ask', label: msg('Ask to be paid') },
          { value: 'send', label: msg('I’m paying') },
        ],
      },
      { key: 'amount', label: msg('Amount'), type: 'amount', required: true },
      { key: 'note', label: msg('For'), type: 'text' },
      { key: 'due', label: msg('Due'), type: 'date' },
    ],
    // The first is where an ask starts; one who's paying starts at sent (`initialKitState`).
    states: ['requested', 'sent', 'paid', 'not_received', 'declined', 'cancelled'],
  },
  support_ticket: {
    id: 'support_ticket',
    name: msg('Support ticket'),
    description: msg('Open a tracked support issue'),
    icon: 'life-buoy',
    spheres: ['customer', 'organization', 'service_provider'],
    groups: false,
    fields: [
      { key: 'title', label: msg('Issue'), type: 'text', required: true },
      { key: 'details', label: msg('Details'), type: 'longtext' },
    ],
    states: ['open', 'in_progress', 'waiting', 'resolved'],
  },
  appointment: {
    id: 'appointment',
    name: msg('Appointment'),
    description: msg('Book an appointment'),
    icon: 'calendar-check',
    spheres: ['customer', 'service_provider', 'professional'],
    groups: false,
    fields: [
      { key: 'title', label: msg('For'), type: 'text', required: true },
      { key: 'start', label: msg('When'), type: 'datetime', required: true },
      { key: 'place', label: msg('Where'), type: 'text' },
    ],
    states: ['requested', 'confirmed', 'done', 'cancelled'],
  },
  location: {
    id: 'location',
    name: msg('Location'),
    description: msg('Share a place, or where you are right now'),
    icon: 'map-pin',
    spheres: ['family', 'friend', 'service_provider'],
    groups: true,
    // Under-18 accounts don't share locations (R29).
    adultsOnly: true,
    fields: [{ key: 'place', label: msg('Place'), type: 'location', required: true }],
    states: ['shared'],
  },
  shared_album: {
    id: 'shared_album',
    name: msg('Album'),
    description: msg('Collect photos together'),
    icon: 'images',
    spheres: ['family', 'friend', 'community'],
    groups: true,
    fields: [{ key: 'title', label: msg('Album name'), type: 'text', required: true }],
    states: ['open', 'closed'],
  },
  poll: {
    id: 'poll',
    name: msg('Poll'),
    description: msg('Ask everyone to choose'),
    icon: 'chart-bar',
    spheres: null,
    groups: true,
    fields: [
      { key: 'question', label: msg('Question'), type: 'text', required: true },
      { key: 'options', label: msg('Options'), type: 'options', required: true },
    ],
    states: ['open', 'closed'],
  },
  checklist: {
    id: 'checklist',
    name: msg('Checklist'),
    description: msg('A shared list to tick off together'),
    icon: 'list-checks',
    spheres: ['family', 'friend', 'work', 'community'],
    groups: true,
    fields: [
      { key: 'title', label: msg('List name'), type: 'text', required: true },
      { key: 'items', label: msg('Items'), type: 'items' },
    ],
    states: ['open', 'done'],
  },
  split: {
    id: 'split',
    name: msg('Split'),
    description: msg('Who owes what for something one of you paid, settled here, moved nowhere'),
    icon: 'hand-coins',
    spheres: ['family', 'friend', 'work', 'community'],
    groups: true,
    // It's about money (R38: a record of who owes whom, never a transfer), so never with a minor.
    adultsOnly: true,
    fields: [
      { key: 'title', label: msg('What it was for'), type: 'text', required: true },
      { key: 'amount', label: msg('Paid in all'), type: 'amount', required: true },
    ],
    states: ['open', 'settled'],
  },
};

export interface KitContext {
  /** The spheres of the other side: my classifications of the other person (direct) or of members (group). */
  spheres: Sphere[];
  isGroup: boolean;
  viewerIsMinor: boolean;
  /** Business conversations get their own set regardless of personal classification. */
  isBusiness?: boolean;
}

/**
 * The kits that fit this conversation, most specific first. Kits tied to the relationship come
 * before kits that fit everyone, so a vendor conversation leads with Order, Delivery, Invoice.
 */
export function kitsFor(ctx: KitContext): KitDef[] {
  const spheres: Sphere[] = ctx.isBusiness ? ['customer', 'organization'] : ctx.spheres;
  const fits = (kit: KitDef) =>
    (kit.spheres === null || kit.spheres.some((s) => spheres.includes(s))) &&
    (!ctx.isGroup || kit.groups) &&
    (!kit.adultsOnly || !ctx.viewerIsMinor);
  const specific = KIT_IDS.map((id) => KITS[id]).filter((k) => k.spheres !== null && fits(k));
  const general = KIT_IDS.map((id) => KITS[id]).filter((k) => k.spheres === null && fits(k));
  return [...specific, ...general];
}
