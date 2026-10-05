import { describe, expect, it } from 'vitest';
import { initialKitState, kitMoves } from './kit-cards';
import { methodsFor, type PaymentSettings, payableByAnyone, paymentUrlError } from './payments';
import { PaymentsBody } from './schemas';

const settings: PaymentSettings = {
  methods: [
    {
      id: 'cib',
      kind: 'bank',
      label: 'CIB',
      details: 'EG38 0019 0005 0000 0000 2631 8000 2',
      url: null,
      audience: 'connections',
    },
    { id: 'cash', kind: 'cash', label: 'Cash', details: null, url: null, audience: 'public' },
    {
      id: 'fam',
      kind: 'wallet',
      label: 'Vodafone Cash',
      details: '010 1234 5678',
      url: null,
      audience: ['family'],
    },
  ],
  note: 'Put the order number in the reference.',
};

describe('ways to be paid (R62)', () => {
  it('shows each payer only the ways meant for them, without who they were for', () => {
    const stranger = methodsFor(settings, { isConnected: false, spheres: [] });
    expect(stranger.map((m) => m.id)).toEqual(['cash']);
    expect(stranger[0]).not.toHaveProperty('audience');
    expect(methodsFor(settings, { isConnected: true, spheres: [] }).map((m) => m.id)).toEqual([
      'cib',
      'cash',
    ]);
    expect(
      methodsFor(settings, { isConnected: true, spheres: ['family'] }).map((m) => m.id),
    ).toEqual(['cib', 'cash', 'fam']);
    expect(methodsFor(null, { isConnected: true, spheres: [] })).toEqual([]);
    expect(payableByAnyone(settings)).toBe(true);
    expect(payableByAnyone({ ...settings, methods: settings.methods.slice(0, 1) })).toBe(false);
  });

  it('keeps a payment link to https, and asks a bank or a wallet for its details', () => {
    expect(paymentUrlError('https://pay.example/nile')).toBeNull();
    expect(paymentUrlError('http://pay.example')).not.toBeNull();
    expect(paymentUrlError('https://me:secret@pay.example')).not.toBeNull();
    expect(paymentUrlError('pay me')).not.toBeNull();
    const body = (method: Record<string, unknown>) =>
      PaymentsBody.safeParse({
        methods: [{ id: 'm', label: 'Way', audience: 'public', ...method }],
      }).success;
    expect(body({ kind: 'link', url: 'https://pay.example/x' })).toBe(true);
    expect(body({ kind: 'link', url: 'javascript:alert(1)' })).toBe(false);
    expect(body({ kind: 'link' })).toBe(false);
    expect(body({ kind: 'cash', url: 'https://pay.example' })).toBe(false);
    expect(body({ kind: 'bank' })).toBe(false);
    expect(body({ kind: 'bank', details: 'EG38 0019' })).toBe(true);
    expect(body({ kind: 'cash' })).toBe(true);
  });
});

describe('the Pay card’s two ways (R62)', () => {
  const ask = { direction: 'ask' };
  const send = { direction: 'send' };
  const to = (fields: object, state: string, isCreator: boolean) =>
    kitMoves('payment_request', state, isCreator, fields as Record<string, unknown>).map(
      (m) => m.to,
    );

  it('starts where its sender stands: asked, or already sent', () => {
    expect(initialKitState('payment_request', ask)).toBe('requested');
    expect(initialKitState('payment_request', {})).toBe('requested');
    expect(initialKitState('payment_request', send)).toBe('sent');
    expect(initialKitState('approval', send)).toBe('pending');
  });

  it('asked: the payer says it’s sent or declines; the payee marks it received or cancels', () => {
    // The sender asked, so the sender is paid.
    expect(to(ask, 'requested', false)).toEqual(['sent', 'declined']);
    expect(to(ask, 'requested', true)).toEqual(['paid', 'cancelled']);
    // An older card, kept before directions, is an ask.
    expect(to({}, 'requested', true)).toEqual(['paid', 'cancelled']);
  });

  it('sent: only the payee says whether it arrived; not yet goes back to the payer', () => {
    // The sender paid, so the other side is paid.
    expect(to(send, 'sent', true)).toEqual([]);
    expect(to(send, 'sent', false)).toEqual(['paid', 'not_received']);
    expect(to(send, 'not_received', true)).toEqual(['sent', 'cancelled']);
    expect(to(send, 'not_received', false)).toEqual(['paid', 'cancelled']);
    expect(to(ask, 'paid', true)).toEqual([]);
  });
});
