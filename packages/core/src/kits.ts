/**
 * Connect Kits (PRD §41, §88; PRODUCT-REVIEW R19): small action modules that appear only where
 * they fit the relationship. A vendor conversation offers Order, Delivery and Invoice; a
 * manager offers Approval and Meeting; family offers Location and Album. The composer's "+" can
 * only reach kits through `kitsFor`, which is the engineering form of "contextual, not a
 * marketplace".
 */
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
  | 'people'
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
    name: 'Approval',
    description: 'Ask for a yes or no, with a record of the answer',
    icon: 'badge-check',
    spheres: ['work', 'customer', 'vendor', 'professional', 'organization'],
    groups: true,
    fields: [
      { key: 'title', label: 'What needs approval', type: 'text', required: true },
      { key: 'details', label: 'Details', type: 'longtext' },
      { key: 'due', label: 'Needed by', type: 'datetime' },
    ],
    states: ['pending', 'approved', 'rejected'],
  },
  meeting: {
    id: 'meeting',
    name: 'Meeting',
    description: 'Propose a time to meet',
    icon: 'calendar-clock',
    spheres: null,
    groups: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'start', label: 'When', type: 'datetime', required: true },
      {
        key: 'durationMinutes',
        label: 'Duration',
        type: 'options',
        choices: [
          { value: 15, label: '15 min' },
          { value: 30, label: '30 min' },
          { value: 45, label: '45 min' },
          { value: 60, label: '1 hour' },
          { value: 90, label: '1½ hours' },
        ],
      },
      { key: 'place', label: 'Where', type: 'text', placeholder: 'Place or link' },
    ],
    states: ['proposed', 'accepted', 'declined', 'cancelled'],
  },
  document_review: {
    id: 'document_review',
    name: 'Review',
    description: 'Ask someone to review a document',
    icon: 'file-check',
    spheres: ['work', 'customer', 'vendor', 'professional'],
    groups: true,
    fields: [
      { key: 'title', label: 'Document', type: 'text', required: true },
      { key: 'due', label: 'Review by', type: 'datetime' },
    ],
    states: ['requested', 'in_review', 'approved', 'changes_requested'],
  },
  order_status: {
    id: 'order_status',
    name: 'Order',
    description: 'Share an order and its status',
    icon: 'package',
    spheres: ['customer', 'vendor', 'organization'],
    groups: false,
    // It says what it cost: like every card about money, never where someone under 18 is.
    adultsOnly: true,
    fields: [
      { key: 'reference', label: 'Order number', type: 'text', required: true },
      { key: 'summary', label: 'What was ordered', type: 'text' },
      { key: 'amount', label: 'Total', type: 'amount' },
    ],
    states: ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'],
  },
  delivery: {
    id: 'delivery',
    name: 'Delivery',
    description: 'Track a delivery',
    icon: 'truck',
    spheres: ['customer', 'vendor', 'service_provider', 'organization'],
    groups: false,
    fields: [
      { key: 'carrier', label: 'Carrier', type: 'text' },
      { key: 'tracking', label: 'Tracking number', type: 'text', required: true },
      { key: 'eta', label: 'Expected', type: 'date' },
    ],
    states: ['in_transit', 'out_for_delivery', 'delivered', 'problem'],
  },
  invoice: {
    id: 'invoice',
    name: 'Invoice',
    description: 'Send or track an invoice',
    icon: 'receipt',
    spheres: ['customer', 'vendor', 'service_provider', 'professional', 'organization'],
    groups: false,
    adultsOnly: true,
    fields: [
      { key: 'reference', label: 'Invoice number', type: 'text', required: true },
      { key: 'amount', label: 'Amount', type: 'amount', required: true },
      { key: 'due', label: 'Due', type: 'date' },
    ],
    states: ['sent', 'paid', 'overdue', 'void'],
  },
  purchase_order: {
    id: 'purchase_order',
    name: 'Purchase order',
    description: 'Raise a purchase order',
    icon: 'clipboard-list',
    spheres: ['vendor', 'organization'],
    groups: false,
    adultsOnly: true,
    fields: [
      { key: 'reference', label: 'PO number', type: 'text', required: true },
      { key: 'summary', label: 'Items', type: 'longtext' },
      { key: 'amount', label: 'Total', type: 'amount' },
    ],
    states: ['sent', 'accepted', 'fulfilled', 'cancelled'],
  },
  payment_request: {
    id: 'payment_request',
    name: 'Payment request',
    description: 'Ask for a payment and mark it paid',
    icon: 'hand-coins',
    spheres: null,
    groups: true,
    adultsOnly: true,
    fields: [
      { key: 'amount', label: 'Amount', type: 'amount', required: true },
      { key: 'note', label: 'For', type: 'text' },
      { key: 'due', label: 'Due', type: 'date' },
    ],
    states: ['requested', 'paid', 'declined'],
  },
  support_ticket: {
    id: 'support_ticket',
    name: 'Support ticket',
    description: 'Open a tracked support issue',
    icon: 'life-buoy',
    spheres: ['customer', 'organization', 'service_provider'],
    groups: false,
    fields: [
      { key: 'title', label: 'Issue', type: 'text', required: true },
      { key: 'details', label: 'Details', type: 'longtext' },
    ],
    states: ['open', 'in_progress', 'waiting', 'resolved'],
  },
  appointment: {
    id: 'appointment',
    name: 'Appointment',
    description: 'Book an appointment',
    icon: 'calendar-check',
    spheres: ['customer', 'service_provider', 'professional'],
    groups: false,
    fields: [
      { key: 'title', label: 'For', type: 'text', required: true },
      { key: 'start', label: 'When', type: 'datetime', required: true },
      { key: 'place', label: 'Where', type: 'text' },
    ],
    states: ['requested', 'confirmed', 'done', 'cancelled'],
  },
  location: {
    id: 'location',
    name: 'Location',
    description: 'Share a place, or where you are right now',
    icon: 'map-pin',
    spheres: ['family', 'friend', 'service_provider'],
    groups: true,
    // Under-18 accounts don't share locations (R29).
    adultsOnly: true,
    fields: [{ key: 'place', label: 'Place', type: 'location', required: true }],
    states: ['shared'],
  },
  shared_album: {
    id: 'shared_album',
    name: 'Album',
    description: 'Collect photos together',
    icon: 'images',
    spheres: ['family', 'friend', 'community'],
    groups: true,
    fields: [{ key: 'title', label: 'Album name', type: 'text', required: true }],
    states: ['open', 'closed'],
  },
  poll: {
    id: 'poll',
    name: 'Poll',
    description: 'Ask everyone to choose',
    icon: 'chart-bar',
    spheres: null,
    groups: true,
    fields: [
      { key: 'question', label: 'Question', type: 'text', required: true },
      { key: 'options', label: 'Options', type: 'options', required: true },
    ],
    states: ['open', 'closed'],
  },
  checklist: {
    id: 'checklist',
    name: 'Checklist',
    description: 'A shared list to tick off together',
    icon: 'list-checks',
    spheres: ['family', 'friend', 'work', 'community'],
    groups: true,
    fields: [
      { key: 'title', label: 'List name', type: 'text', required: true },
      { key: 'items', label: 'Items', type: 'items' },
    ],
    states: ['open', 'done'],
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
