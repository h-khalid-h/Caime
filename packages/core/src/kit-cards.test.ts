import { describe, expect, it } from 'vitest';
import { formatAmount, messagePreview, systemText } from './format';
import {
  askedBy,
  CARD_KITS,
  KIT_FLOWS,
  kitDetails,
  kitHeadline,
  kitMoves,
  kitStateLabel,
  kitStateTone,
  orderDetails,
  prepareKitFields,
  retimeBlock,
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
      // A checklist moves by its items being ticked, a split by its shares being settled and a
      // form by its answers, not by buttons (checklistState, splitState, answerForm).
      if (id !== 'checklist' && id !== 'split' && id !== 'form')
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
    // A length no choice names, as an invitation from someone's calendar has one (M16 F4).
    const length = (durationMinutes: number) =>
      kitDetails('meeting', { ...fields, durationMinutes }, opts).find(
        (d) => d.key === 'durationMinutes',
      )?.value;
    expect(length(50)).toBe('50 min');
    expect(length(120)).toBe('2 h');
    expect(length(135)).toBe('2 h 15 min');
    expect(length(60)).toBe('1 hour');
    // Held on Caime with Cai's notes chosen ahead (M16 F7c): said under Where, consent and all.
    expect(
      kitDetails('meeting', { ...fields, place: 'Caime', notes: 'cai' }, opts).slice(-2),
    ).toEqual([
      { key: 'place', label: 'Where', value: 'Caime' },
      { key: 'notes', label: 'Notes', value: 'Cai, once everyone in the call says yes' },
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
    // A call's recording shared on (R114 (7)): a text with the server's mark and no words.
    expect(
      messagePreview({
        kind: 'text',
        body: null,
        payload: { recording: { callId: 'c1' } },
        deleted: false,
      }),
    ).toBe('🎙 Call recording');
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

describe('another time for a meeting or an appointment (M16 F5)', () => {
  it('asks of whoever didn’t suggest the time it has now', () => {
    expect(askedBy({}, 'ana')).toBe('ana');
    expect(askedBy({ proposedBy: 'ben' }, 'ana')).toBe('ben');
    expect(askedBy({ proposedBy: 42 }, null)).toBeNull();
    // Ben's suggestion is Ana's to answer, on Ana's own card.
    const isCreator = (me: string) => askedBy({ proposedBy: 'ben' }, 'ana') === me;
    expect(kitMoves('meeting', 'proposed', isCreator('ana')).map((m) => m.to)).toEqual([
      'accepted',
      'declined',
    ]);
    expect(kitMoves('meeting', 'proposed', isCreator('ben')).map((m) => m.to)).toEqual([
      'cancelled',
    ]);
  });
  it('moves a meeting or an appointment, asked or agreed, at one time and its own', () => {
    const at = { start: { at: '2026-10-22T09:00:00.000Z', hasTime: true } };
    expect(retimeBlock({ kit: 'meeting', state: 'proposed', fields: at })).toBeNull();
    expect(retimeBlock({ kit: 'meeting', state: 'accepted', fields: at })).toBeNull();
    expect(retimeBlock({ kit: 'appointment', state: 'confirmed', fields: at })).toBeNull();
    expect(retimeBlock({ kit: 'invoice', state: 'sent' })).toBe('kind');
    expect(retimeBlock({ kit: 'meeting', state: 'cancelled' })).toBe('state');
    expect(retimeBlock({ kit: 'appointment', state: 'done' })).toBe('state');
    // A meeting's time of a series moves alone (R123); a repeating appointment's doesn't.
    expect(
      retimeBlock({ kit: 'meeting', state: 'accepted', fields: { ...at, repeat: 'week' } }),
    ).toBeNull();
    expect(
      retimeBlock({ kit: 'appointment', state: 'confirmed', fields: { ...at, repeat: 'week' } }),
    ).toBe('series');
    expect(retimeBlock({ kit: 'meeting', state: 'proposed', invitation: { uid: 'x' } })).toBe(
      'invitation',
    );
    expect(retimeBlock({ kit: 'meeting', state: 'accepted', movedTo: { id: 'x' } })).toBe('moved');
    // A booking moves too, to an open time of its catalog (M16 F5b: the server's to check).
    expect(
      retimeBlock({
        kit: 'appointment',
        state: 'confirmed',
        fields: at,
        booking: { itemId: 'x' },
      } as never),
    ).toBeNull();
  });
  it('says so in the conversation, by whoever suggested it', () => {
    const line = { event: 'time_suggested', byId: 'ben', by: 'Ben', title: 'Plan the launch' };
    expect(systemText(line, 'ana')).toBe('Ben suggested another time for “Plan the launch”');
    expect(systemText(line, 'ben')).toBe('You suggested another time for “Plan the launch”');
    expect(systemText({ ...line, title: null }, 'ana')).toBe('Ben suggested another time');
  });
});

describe('where an order is had (M16 F6)', () => {
  const order = {
    number: 'A-1',
    lines: [],
    total: null,
    fulfilment: 'pickup' as const,
  };
  it('says it’s sent on Caime, or the place it’s from, unless it’s delivered', () => {
    expect(orderDetails({ ...order, where: 'Caime' } as never)).toEqual(
      expect.arrayContaining([{ key: 'where', label: 'Where', value: 'Sent on Caime' }]),
    );
    expect(orderDetails({ ...order, where: '9 Road 233, Cairo' } as never)).toEqual(
      expect.arrayContaining([{ key: 'where', label: 'Where', value: '9 Road 233, Cairo' }]),
    );
    expect(
      orderDetails({ ...order, fulfilment: 'delivery', where: 'Caime' } as never).map((d) => d.key),
    ).not.toContain('where');
    // Without a way to have it, its Where alone.
    expect(orderDetails({ ...order, fulfilment: null, where: 'Caime' } as never)).toEqual([
      { key: 'where', label: 'Where', value: 'Sent on Caime' },
    ]);
    expect(orderDetails({ ...order, fulfilment: null } as never)).toEqual([]);
  });
});
