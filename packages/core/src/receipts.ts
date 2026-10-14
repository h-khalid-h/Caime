/**
 * A receipt from a paid Pay card (R62, R65): the record of a payment both sides agreed happened,
 * kept by neither as money (Caime holds and moves none) and no tax invoice. Its number comes
 * from the card's own id, so it reads the same every time it's asked for; its sides are the
 * card's. Pure, no zod: the app reads it by subpath for the sheet and the words it shares.
 */
import type { ReceiptParty, ReceiptView } from './api';
import { formatAmount, formatDeadline } from './format';
import { tr } from './i18n';

/** Crockford's base32 (as the recovery key writes it): no I, L, O or U to misread. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** "R-7F3K-2Q9M": the last forty bits of the card's id, eight letters, the same every time. */
export function receiptNumber(messageId: string): string {
  const hex = messageId.replace(/[^0-9a-f]/gi, '').slice(-10);
  let n = Number.parseInt(hex || '0', 16);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return `R-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** A side as a receipt names it: the name, its handle, and an organization's verified domain. */
export function partyLine(p: ReceiptParty): string {
  return [p.name, p.handle ? `@${p.handle}` : null, p.domain].filter(Boolean).join(' · ');
}

/** The receipt's lines, labelled in the reader's language, its dates in their zone. */
export function receiptLines(
  r: ReceiptView,
  clock: { now: Date; timeZone: string; locale: string },
): Array<{ key: string; label: string; value: string }> {
  return [
    { key: 'number', label: tr('Number'), value: r.number },
    {
      key: 'paid',
      label: tr('Paid on'),
      value: formatDeadline(r.paidAt, clock.now, clock.timeZone, clock.locale),
    },
    {
      key: 'amount',
      label: tr('Amount'),
      value: formatAmount(r.amount.value, r.amount.currency, clock.locale),
    },
    ...(r.note ? [{ key: 'for', label: tr('For'), value: r.note }] : []),
    { key: 'to', label: tr('Paid to'), value: partyLine(r.payee) },
    ...(r.payer ? [{ key: 'by', label: tr('Paid by'), value: partyLine(r.payer) }] : []),
    {
      key: 'how',
      label: tr('How'),
      value:
        r.how === 'card'
          ? tr('By card')
          : tr('Confirmed received by {name}', { name: r.payee.name }),
    },
  ];
}

/** The receipt as words to share or keep: its lines, and what it is. */
export function receiptText(
  r: ReceiptView,
  clock: { now: Date; timeZone: string; locale: string },
): string {
  return [
    tr('Receipt'),
    ...receiptLines(r, clock).map((l) => `${l.label}: ${l.value}`),
    tr('A record of a payment both sides agreed on. Caime holds no money.'),
  ].join('\n');
}
