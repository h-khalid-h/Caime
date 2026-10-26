import { describe, expect, it } from 'vitest';
import { sharedWords } from './shared';

describe('what another app shares into Caime (R120)', () => {
  it('says the title, the text and the link once each, in that order', () => {
    expect(
      sharedWords({ title: 'Lantern', text: 'Look at this', url: 'https://example.com/a' }),
    ).toBe('Lantern\nLook at this\nhttps://example.com/a');
  });

  it('drops what another part already says: the link in the text, a title the text opens with', () => {
    expect(
      sharedWords({
        title: 'Lantern',
        text: 'Lantern opens Friday https://example.com/a',
        url: 'https://example.com/a',
      }),
    ).toBe('Lantern opens Friday https://example.com/a');
    expect(sharedWords({ text: 'https://example.com/a', url: 'https://example.com/a' })).toBe(
      'https://example.com/a',
    );
  });

  it('is empty when nothing came', () => {
    expect(sharedWords({})).toBe('');
    expect(sharedWords({ title: '  ', text: '' })).toBe('');
  });
});
