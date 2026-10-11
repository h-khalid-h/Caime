import { describe, expect, it } from 'vitest';
import { ASKING_STATES, cardAsks, DUE_STATES, kitStateLabel, kitStateTone } from './kit-states';
import { KITS } from './kits';

describe('a card that asks (review 2026-10-09 M14)', () => {
  it('asks in the states where the other side owes an answer, and stops once it is given', () => {
    expect(cardAsks({ kit: 'approval', state: 'pending' })).toBe(true);
    expect(cardAsks({ kit: 'approval', state: 'approved' })).toBe(false);
    expect(cardAsks({ kit: 'meeting', state: 'proposed' })).toBe(true);
    expect(cardAsks({ kit: 'meeting', state: 'accepted' })).toBe(false);
    expect(cardAsks({ kit: 'appointment', state: 'requested' })).toBe(true);
    expect(cardAsks({ kit: 'appointment', state: 'confirmed' })).toBe(false);
    expect(cardAsks({ kit: 'invoice', state: 'overdue' })).toBe(true);
    expect(cardAsks({ kit: 'invoice', state: 'paid' })).toBe(false);
    expect(cardAsks({ kit: 'order_status', state: 'placed' })).toBe(true);
    expect(cardAsks({ kit: 'order_status', state: 'shipped' })).toBe(false);
  });

  it('a Pay card asks when it asks to be paid, never when it says it is paying', () => {
    expect(
      cardAsks({ kit: 'payment_request', state: 'requested', fields: { direction: 'ask' } }),
    ).toBe(true);
    expect(cardAsks({ kit: 'payment_request', state: 'sent', fields: { direction: 'send' } })).toBe(
      false,
    );
    expect(cardAsks({ kit: 'payment_request', state: 'paid', fields: { direction: 'ask' } })).toBe(
      false,
    );
  });

  it('never for a card it does not know, or a payload that is not a card', () => {
    expect(cardAsks({ kit: 'custom:acme:quote', state: 'draft' })).toBe(false);
    expect(cardAsks({ kit: 'checklist', state: 'open' })).toBe(false);
    expect(cardAsks(null)).toBe(false);
    expect(cardAsks({})).toBe(false);
    expect(cardAsks('meeting')).toBe(false);
  });

  it('names only states its kits have', () => {
    for (const [kit, states] of Object.entries(ASKING_STATES))
      for (const state of states)
        expect(KITS[kit as keyof typeof KITS].states, kit).toContain(state);
    for (const [kit, states] of Object.entries(DUE_STATES))
      for (const state of states)
        expect(KITS[kit as keyof typeof KITS].states, kit).toContain(state);
  });
});

describe('a state’s label and tone', () => {
  it('labels every state of every kit, in sentence case, with a tone', () => {
    for (const kit of Object.values(KITS))
      for (const state of kit.states) {
        const label = kitStateLabel(state);
        expect(label).toMatch(/^[A-Z]/);
        expect(label).not.toContain('_');
        expect(['positive', 'negative', 'neutral']).toContain(kitStateTone(state));
      }
    expect(kitStateLabel('not_received')).toBe('Not received yet');
    expect(kitStateTone('paid')).toBe('positive');
    expect(kitStateTone('declined')).toBe('negative');
  });
});
