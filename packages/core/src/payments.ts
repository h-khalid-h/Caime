/**
 * Ways to be paid, and the Pay card's two directions (R62). Caime never holds or moves money
 * (R38): a host (a person or an organization) says how it's paid (a bank transfer, a payment
 * link of its own, a wallet number, cash), each way with an audience, and a Pay card carries the
 * payee's ways the payer may see, fixed by the server when it's sent. The card records the
 * rest: asked, sent, received, or not received yet. Pure, no zod: the app takes it by subpath.
 */
import { type BookingAudience, canBook } from './booking';
import { msg } from './i18n';
import type { Sphere } from './taxonomy';

export const PAYMENT_METHODS_MAX = 8;

export const PAYMENT_KINDS = ['bank', 'link', 'wallet', 'cash', 'other'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** Each kind's name, as a key (shown through `tr`). */
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  bank: msg('Bank transfer'),
  link: msg('Payment link'),
  wallet: msg('Wallet'),
  cash: msg('Cash'),
  other: msg('Other'),
};

/** One way to be paid: what it is, what the payer needs to use it, and who may see it. */
export interface PaymentMethod {
  id: string;
  kind: PaymentKind;
  /** "CIB, EGP account", "InstaPay", "Pay online". */
  label: string;
  /** What the payer copies: an account number, an IBAN, a wallet number. None for cash. */
  details: string | null;
  /** A payment link of the host's own (https), for `link`. */
  url: string | null;
  audience: BookingAudience;
}

export interface PaymentSettings {
  methods: PaymentMethod[];
  /** A line the payer reads first: "Please put your order number in the reference." */
  note: string | null;
}

/** What a Pay card shows the payer: whom, and how, as it was when the card was sent. */
export interface PayTo {
  name: string;
  methods: Array<Omit<PaymentMethod, 'audience'>>;
  note: string | null;
  /** The organization paid, when it's one. */
  orgId?: string;
  /** The payee is an organization with its own checkout (R65): the payer may pay by card. */
  checkout?: boolean;
}

/** Which way a Pay card goes: the sender asks to be paid, or says they're paying. */
export type PayDirection = 'ask' | 'send';

export function payDirection(fields: Record<string, unknown> | undefined): PayDirection {
  return fields?.direction === 'send' ? 'send' : 'ask';
}

/** Whether the card's sender is its payer: they are when they're the one paying. */
export function senderPays(fields: Record<string, unknown> | undefined): boolean {
  return payDirection(fields) === 'send';
}

/** The ways this payer may see, in the host's order, without their audiences. */
export function methodsFor(
  settings: PaymentSettings | null,
  viewer: { isSelf?: boolean; isConnected: boolean; spheres: readonly Sphere[] },
): PayTo['methods'] {
  if (!settings) return [];
  return settings.methods
    .filter((m) => canBook(m.audience, viewer))
    .map(({ audience: _, ...m }) => m);
}

/** Whether anyone at all may pay this host from its page: a way for everyone. */
export function payableByAnyone(settings: PaymentSettings | null): boolean {
  return Boolean(settings?.methods.some((m) => m.audience === 'public'));
}

/** Whether a payment link may be kept: https, a host, nothing hidden in it. */
export function paymentUrlError(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return msg('That isn’t a link.');
  }
  if (u.protocol !== 'https:') return msg('A payment link starts with https://.');
  if (u.username || u.password) return msg('Leave passwords out of the address.');
  return null;
}
