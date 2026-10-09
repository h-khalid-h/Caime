/**
 * Cai and the Caime Friends in the Arabic people speak (R72): each voice (`VOICES`, an overlay on
 * the standard catalog) has every line they say, by the rules, from `lib/system-accounts.ts` and
 * `lib/cai.ts`, in plural forms where it counts, with every placeholder, and nothing else: the
 * interface, a refusal and a name stay in Standard Arabic whoever reads them.
 */
import { ar } from '@caime/core/locales/ar';
import { describe, expect, it } from 'vitest';
import { collectKeys } from '../../../scripts/i18n-keys.mjs';
import { VOICES } from '../src/lib/i18n';
import { arServer } from '../src/locales/ar-server';

const SPEAKERS = ['apps/server/src/lib/system-accounts.ts', 'apps/server/src/lib/cai.ts'];
/** What those files say that isn't Cai or a friend talking: refusals, a name, a stand-in. */
const NOT_SPOKEN = ['Someone', 'Cai', 'That follow-up', 'That wait', 'That’s no longer open.'];
/** Said through a key core hands back (`greetingKey`): the brief's first line. */
const GREETINGS = ['Good morning, {name}', 'Good afternoon, {name}', 'Good evening, {name}'];

const keys = collectKeys() as Map<string, { text: string; plural: boolean; files: Set<string> }>;
const spoken = [...keys.values()].filter(
  (k) => SPEAKERS.some((f) => k.files.has(f)) && !NOT_SPOKEN.includes(k.text),
);
const standard: Record<string, unknown> = { ...ar, ...arServer };

describe.each(Object.entries(VOICES))('Cai and the friends in %s Arabic (R72)', (_name, lines) => {
  it('say every line they have in it, with plural forms where it counts', () => {
    expect(spoken.length).toBeGreaterThan(50);
    expect(spoken.filter((k) => !(k.text in lines!)).map((k) => k.text)).toEqual([]);
    expect(GREETINGS.filter((g) => !(g in lines!))).toEqual([]);
    const wrong = spoken
      .filter((k) => (typeof lines![k.text] === 'string') === k.plural)
      .map((k) => k.text);
    expect(wrong).toEqual([]);
  });

  it('keep nothing they no longer say, and nothing the standard doesn’t have', () => {
    const allowed = new Set([...spoken.map((k) => k.text), ...GREETINGS]);
    expect(Object.keys(lines!).filter((k) => !allowed.has(k))).toEqual([]);
    expect(Object.keys(lines!).filter((k) => !(k in standard))).toEqual([]);
  });

  it('keep every placeholder of the English', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(lines!)) {
      const wanted = key.match(/\{\w+\}/g) ?? [];
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms)
        for (const w of wanted)
          if (!form.includes(w) && !(w === '{n}' && typeof value !== 'string'))
            bad.push(`${key} → ${form}`);
    }
    expect(bad).toEqual([]);
  });
});
