import { describe, expect, it } from 'vitest';
import { formatAmount, messagePreview } from './format';
import {
  CARD_KITS,
  KIT_FLOWS,
  kitDetails,
  kitHeadline,
  kitMoves,
  kitStateLabel,
  kitStateTone,
  prepareKitFields,
} from './kit-cards';
import { KITS } from './kits';

describe('kit flows', () => {
  it('only move between states the kit has, and every card can move from where it starts', () => {
    for (const id of CARD_KITS) {
      const kit = KITS[id];
      const flows = KIT_FLOWS[id];
      for (const [from, moves] of Object.entries(flows)) {
        expect(kit.states, `${id}: ${from}`).toContain(from);
        for (const move of moves)
          expect(kit.states, `${id}: ${from} → ${move.to}`).toContain(move.to);
      }
      // A checklist moves by its items being ticked, not by buttons (checklistState).
      if (id !== 'checklist')
        expect(flows[kit.states[0]!]?.length, `${id} starts stuck`).toBeGreaterThan(0);
    }
  });

  it('let the right person make each move', () => {
    const labels = (isCreator: boolean) =>
      kitMoves('approval', 'pending', isCreator).map((m) => m.label);
    expect(labels(false)).toEqual(['Approve', 'Reject']);
    expect(labels(true)).toEqual([]);
    expect(kitMoves('meeting', 'proposed', true).map((m) => m.to)).toEqual(['cancelled']);
    expect(kitMoves('meeting', 'accepted', false).map((m) => m.to)).toEqual(['cancelled']);
    expect(kitMoves('approval', 'approved', false)).toEqual([]);
    expect(kitMoves('request' as never, 'open', false)).toEqual([]);
  });

  it('read their states in words, with a tone', () => {
    expect(kitStateLabel('pending')).toBe('Waiting for an answer');
    expect(kitStateLabel('shipped')).toBe('Shipped');
    expect(kitStateLabel('changes_requested')).toBe('Changes asked for');
    expect(kitStateTone('approved')).toBe('positive');
    expect(kitStateTone('declined')).toBe('negative');
    expect(kitStateTone('proposed')).toBe('neutral');
  });
});

describe('prepareKitFields', () => {
  it('keeps what the kit defines, in the shape it stores', () => {
    const r = prepareKitFields('meeting', {
      title: '  Venue walkthrough ',
      start: { at: '2026-10-02T13:00:00+02:00', hasTime: true },
      durationMinutes: 45,
      place: 'Cairo Opera House',
      sneaky: 'dropped',
    });
    expect(r).toEqual({
      ok: true,
      kit: 'meeting',
      def: KITS.meeting,
      fields: {
        title: 'Venue walkthrough',
        start: { at: '2026-10-02T11:00:00.000Z', hasTime: true },
        durationMinutes: 45,
        place: 'Cairo Opera House',
      },
    });
    expect(
      prepareKitFields('payment_request', { amount: { value: 1200.456, currency: 'EGP' } }),
    ).toMatchObject({ ok: true, fields: { amount: { value: 1200.46, currency: 'EGP' } } });
    // As each currency keeps amounts: the Kuwaiti dinar to its thousandth, the yen whole.
    expect(
      prepareKitFields('payment_request', { amount: { value: 12.345, currency: 'KWD' } }),
    ).toMatchObject({ ok: true, fields: { amount: { value: 12.345, currency: 'KWD' } } });
    expect(
      prepareKitFields('payment_request', { amount: { value: 1200.6, currency: 'JPY' } }),
    ).toMatchObject({ ok: true, fields: { amount: { value: 1201, currency: 'JPY' } } });
    // Checking again changes nothing, and what rounds to nothing isn't an amount.
    const once = prepareKitFields('payment_request', { amount: { value: 7.777, currency: 'OMR' } });
    expect(once.ok && prepareKitFields('payment_request', once.fields)).toEqual(once);
    expect(
      prepareKitFields('payment_request', { amount: { value: 0.004, currency: 'EGP' } }),
    ).toEqual({ ok: false, error: 'Amount: enter an amount.' });
    // Nor what no one asks for: a trillion is the most.
    expect(prepareKitFields('payment_request', { amount: { value: 1e12 } })).toMatchObject({
      ok: true,
    });
    expect(
      prepareKitFields('payment_request', { amount: { value: 1e12 + 1, currency: 'EGP' } }),
    ).toEqual({ ok: false, error: 'Amount: enter an amount.' });
  });

  it('says what is missing or wrong, in the field’s own words', () => {
    expect(prepareKitFields('approval', {})).toEqual({
      ok: false,
      error: 'What needs approval is needed.',
    });
    expect(prepareKitFields('meeting', { title: 'x', start: { at: 'soon' } })).toEqual({
      ok: false,
      error: 'When: choose a time.',
    });
    expect(
      prepareKitFields('meeting', {
        title: 'x',
        start: { at: '2026-10-02T11:00:00Z' },
        durationMinutes: 7,
      }),
    ).toEqual({ ok: false, error: 'Duration: pick one of the choices.' });
    expect(prepareKitFields('invoice', { reference: 'INV-1', amount: { value: -5 } })).toEqual({
      ok: false,
      error: 'Amount: enter an amount.',
    });
    expect(prepareKitFields('approval', { title: 'x'.repeat(201) })).toEqual({
      ok: false,
      error: 'What needs approval: keep it under 200 characters.',
    });
  });

  it('refuses kits that aren’t cards, including the server’s own request card', () => {
    for (const kit of ['request', 'poll', 'location', 'nope', 7]) {
      expect(prepareKitFields(kit, { title: 'x' })).toEqual({
        ok: false,
        error: 'That card isn’t available.',
      });
    }
  });
});

describe('how a card reads', () => {
  const opts = { now: new Date('2026-09-28T08:00:00Z'), timeZone: 'Africa/Cairo', locale: 'en' };

  it('leads with what it is about, then the rest, labelled', () => {
    const fields = {
      title: 'Venue walkthrough',
      start: { at: '2026-10-02T11:00:00.000Z', hasTime: true },
      durationMinutes: 45,
      place: 'Cairo Opera House',
    };
    expect(kitHeadline('meeting', fields)).toBe('Venue walkthrough');
    expect(kitDetails('meeting', fields, opts)).toEqual([
      { key: 'start', label: 'When', value: 'Fri 2:00 PM' },
      { key: 'durationMinutes', label: 'Duration', value: '45 min' },
      { key: 'place', label: 'Where', value: 'Cairo Opera House' },
    ]);
    const pay = {
      amount: { value: 1200, currency: 'EGP' },
      note: 'the tickets',
      due: '2026-10-15',
    };
    // Intl puts a no-break space after the currency code.
    expect(kitHeadline('payment_request', pay)).toBe(
      `${formatAmount(1200, 'EGP')} for the tickets`,
    );
    expect(kitDetails('payment_request', pay, opts)).toEqual([
      { key: 'due', label: 'Due', value: 'Oct 15' },
    ]);
    // Another year says which.
    expect(kitDetails('payment_request', { ...pay, due: '2027-10-15' }, opts)[0]?.value).toBe(
      'Oct 15, 2027',
    );
    expect(kitHeadline('invoice', { reference: 'INV-204' })).toBe('Invoice INV-204');
  });

  it('shows up in lists by kit and headline', () => {
    expect(
      messagePreview({
        kind: 'kit',
        body: null,
        payload: { kit: 'meeting', label: 'Meeting', title: 'Venue walkthrough' },
        deleted: false,
      }),
    ).toBe('Meeting: Venue walkthrough');
    expect(
      messagePreview({
        kind: 'kit',
        body: null,
        payload: { kit: 'request', title: 'Send the deck' },
        deleted: false,
      }),
    ).toBe('Send the deck');
    // A private one has nothing to show, edited or not; deleted, it says so.
    const sealed = { kind: 'text', body: null, payload: {}, sealed: { v: 1 } };
    expect(messagePreview({ ...sealed, deleted: false })).toBe('Encrypted message');
    expect(messagePreview({ ...sealed, deleted: true })).toBe('Message deleted');
  });
});
