import { describe, expect, it } from 'vitest';
import type { ReceiptView } from './api';
import { paySides } from './kit-cards';
import { partyLine, receiptLines, receiptNumber, receiptText } from './receipts';

const R: ReceiptView = {
  number: 'R-0000-0001',
  messageId: 'm',
  conversationId: 'c',
  paidAt: '2026-10-14T09:30:00.000Z',
  amount: { value: 400, currency: 'EGP' },
  note: 'Cleaning',
  payee: { name: 'Nile Dental', handle: 'nile.dental', domain: 'niledental.example' },
  payer: { name: 'Lina Farah', handle: 'lina', domain: null },
  how: 'confirmed',
};
const clock = { now: new Date('2026-10-14T12:00:00Z'), timeZone: 'Africa/Cairo', locale: 'en' };

describe('receipts (R62)', () => {
  it('number a card the same every time, in letters that read back', () => {
    const id = '0192f3a4-7b1c-7d2e-8f30-a1b2c3d4e5f6';
    expect(receiptNumber(id)).toBe(receiptNumber(id));
    expect(receiptNumber(id)).toMatch(
      /^R-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/,
    );
    expect(receiptNumber('0192f3a4-7b1c-7d2e-8f30-a1b2c3d4e5f7')).not.toBe(receiptNumber(id));
  });

  it('know who paid and who was paid', () => {
    // Paying: the sender pays the other side.
    expect(paySides({ fields: { direction: 'send' } }, 'a', 'b')).toEqual({
      payerId: 'a',
      payeeId: 'b',
    });
    // Asking: the other side pays the sender; in a group, whoever said they'd paid.
    expect(paySides({ fields: { direction: 'ask' } }, 'a', 'b')).toEqual({
      payerId: 'b',
      payeeId: 'a',
    });
    expect(
      paySides(
        {
          fields: { direction: 'ask' },
          history: [
            { state: 'sent', by: 'c' },
            { state: 'paid', by: 'a' },
          ],
        },
        'a',
        null,
      ),
    ).toEqual({ payerId: 'c', payeeId: 'a' });
    expect(paySides({ fields: {} }, 'a', null)).toEqual({ payerId: null, payeeId: 'a' });
    // A split's share names both.
    expect(paySides({ share: { splitId: 's', payeeId: 'p' } }, 'a', null)).toEqual({
      payerId: 'a',
      payeeId: 'p',
    });
  });

  it('read as lines and as words to share', () => {
    expect(partyLine(R.payee)).toBe('Nile Dental · @nile.dental · niledental.example');
    const lines = receiptLines(R, clock);
    expect(lines.map((l) => l.key)).toEqual(['number', 'paid', 'amount', 'for', 'to', 'by', 'how']);
    expect(lines.find((l) => l.key === 'how')?.value).toBe('Confirmed received by Nile Dental');
    expect(
      receiptLines({ ...R, how: 'card', note: null, payer: null }, clock).map((l) => l.key),
    ).toEqual(['number', 'paid', 'amount', 'to', 'how']);
    const text = receiptText(R, clock);
    expect(text.split('\n')[0]).toBe('Receipt');
    expect(text).toContain('Number: R-0000-0001');
    expect(text).toContain('Caime holds no money');
  });
});
