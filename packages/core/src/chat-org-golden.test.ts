import { describe, expect, it } from 'vitest';
import { chatFree } from './chat-free';
import { chatIntent } from './chat-intent';
import { chatOrg, isOrgWord } from './chat-org';
import { CHAT_ORG_GOLDEN } from './fixtures/chat-org-golden';

describe('Cai asked how an organization is doing, in every language (M17 I15a)', () => {
  for (const lang of ['en', 'ar', 'fr', 'tr'] as const)
    it(`reads every ${lang} line as it was labelled`, () => {
      const lines = CHAT_ORG_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.filter((l) => l.org).length).toBeGreaterThanOrEqual(5);
      expect(lines.filter((l) => !l.org).length).toBeGreaterThanOrEqual(4);
      const wrong = lines
        .map((l) => ({ l, read: chatOrg(l.text) }))
        .filter(({ l, read }) =>
          l.org ? read === null || read.name !== (l.name ?? null) : read !== null,
        )
        .map(({ l, read }) => `${l.text} → ${JSON.stringify(read)}`);
      expect(wrong).toEqual([]);
    });

  it('never takes a question about one’s own time or open things', () => {
    for (const text of ['what am i waiting on', 'when am I free Thursday?', 'what did I miss?'])
      expect([text, chatOrg(text)]).toEqual([text, null]);
    expect(chatIntent('what did I miss?')).toBe('missed');
    expect(chatFree('when am I free Thursday?')).toBe(true);
  });

  it('tells a word for one’s organization from its name', () => {
    expect(isOrgWord('the clinic')).toBe(true);
    expect(isOrgWord('العيادة')).toBe(true);
    expect(isOrgWord('Nile Dental')).toBe(false);
  });
});
