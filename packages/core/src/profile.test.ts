import { describe, expect, it } from 'vitest';
import { RHYTHM_TEXT, rhythmOf } from './format';
import { relationshipOfferText } from './taxonomy';

describe('who someone is to you, in words (PRD §12, §67, §71)', () => {
  it('says how often two people talk, never as a number to compare', () => {
    expect(rhythmOf(12, true)).toBe('most_weeks');
    expect(rhythmOf(8, true)).toBe('most_weeks');
    expect(rhythmOf(7, true)).toBe('now_and_then');
    expect(rhythmOf(3, true)).toBe('now_and_then');
    expect(rhythmOf(2, true)).toBe('rarely');
    expect(rhythmOf(0, true)).toBe('not_lately');
    expect(rhythmOf(0, false)).toBeNull();
    expect(RHYTHM_TEXT.rarely).toBe('Once in a while');
  });

  it('offers a relationship as a possibility, in the words of the relationship', () => {
    expect(
      relationshipOfferText('Sarah', { sphere: 'work', role: 'colleague', orgName: 'DATA C' }),
    ).toBe('Sarah may be your colleague at DATA C');
    expect(relationshipOfferText('Dee', { sphere: 'family' })).toBe('Dee may be family');
    expect(relationshipOfferText('Ben', { sphere: 'work', orgName: 'Acme' })).toBe(
      'Ben may be someone you work with at Acme',
    );
    expect(relationshipOfferText('Ada', { sphere: 'acquaintance' })).toBe(
      'Ada may be an acquaintance',
    );
    expect(relationshipOfferText('Cy', { sphere: 'customer' })).toBe('Cy may be a customer');
    expect(relationshipOfferText('Zed', {})).toBe('Zed may be someone you know');
  });
});
