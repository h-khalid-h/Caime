import { describe, expect, it } from 'vitest';
import {
  CAI_ID,
  CHARACTER_HANDLES,
  caiIntent,
  isSystemKind,
  SYSTEM_ACCOUNTS,
  systemAccountOf,
} from './system-accounts';

describe('Caime’s own accounts (R67)', () => {
  it('are Cai and the seven friends, with fixed ids and their own kinds', () => {
    expect(SYSTEM_ACCOUNTS.map((a) => a.handle)).toEqual(['cai', ...CHARACTER_HANDLES]);
    expect(new Set(SYSTEM_ACCOUNTS.map((a) => a.id)).size).toBe(8);
    expect(systemAccountOf(CAI_ID)).toMatchObject({ handle: 'cai', kind: 'assistant' });
    expect(systemAccountOf('nobody')).toBeUndefined();
    expect(isSystemKind('character')).toBe(true);
    expect(isSystemKind('agent')).toBe(false);
  });

  it('read what Cai answers by the rules, in four languages', () => {
    const cases: Array<[string, ReturnType<typeof caiIntent>]> = [
      ['What am I waiting for?', 'waiting'],
      ['who owes me', 'waiting'],
      ['Who is waiting on me?', 'asked'],
      ['what was asked of me', 'asked'],
      ['My tasks', 'mine'],
      ['what did I promise?', 'mine'],
      ['What’s coming up?', 'coming'],
      ['what do I have tomorrow', 'coming'],
      ['hi', 'help'],
      ['What can you do?', 'help'],
      ['من ينتظرني؟', 'asked'],
      ['ماذا أنتظر؟', 'waiting'],
      ['ما هي مهامي', 'mine'],
      ['ماذا لدي اليوم؟', 'coming'],
      ['مرحبا', 'help'],
      ['Qui m’attend ?', 'asked'],
      ['qu’est-ce que j’attends', 'waiting'],
      ['mes tâches', 'mine'],
      ['qu’est-ce que j’ai demain ?', 'coming'],
      ['Beni kim bekliyor?', 'asked'],
      ['ne bekliyorum', 'waiting'],
      ['görevlerim', 'mine'],
      ['bugün ne var?', 'coming'],
      ['merhaba', 'help'],
    ];
    for (const [text, intent] of cases) expect([text, caiIntent(text)]).toEqual([text, intent]);
  });

  it('leave anything wider to the model', () => {
    for (const text of [
      'What should I do in Paris today?',
      'I’m waiting for the bus, any ideas?',
      'Write a toast for my sister’s wedding',
      'hi, can you help me plan a trip next week?',
      'What to do this weekend',
      '',
    ])
      expect([text, caiIntent(text)]).toEqual([text, null]);
  });
});
