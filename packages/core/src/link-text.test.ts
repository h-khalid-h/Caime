import { describe, expect, it } from 'vitest';
import { extractLinks } from './intelligence';
import { firstLinkIn } from './link-text';

describe('the first link in someone’s words (M16 E4c)', () => {
  it('reads what the server reads: http(s) or www., without the sentence’s end', () => {
    expect(firstLinkIn('Dinner here? https://corner.example/menu.')).toBe(
      'https://corner.example/menu',
    );
    expect(firstLinkIn('see www.example.com/a, then https://b.example')).toBe('www.example.com/a');
    expect(firstLinkIn('(https://example.com/x)')).toBe('https://example.com/x');
    expect(firstLinkIn('no link here, only example.com')).toBeNull();
    expect(firstLinkIn('')).toBeNull();
  });

  it('is the first of the links the message’s entities keep', () => {
    for (const text of [
      'Two: https://a.example/one and www.b.example/two!',
      'مرحبا https://مثال.example/صفحة؟',
      'Mail me@example.com about http://x.example:8080/p?q=1;',
    ])
      expect(firstLinkIn(text)).toBe(extractLinks(text)[0]?.url ?? null);
  });
});
