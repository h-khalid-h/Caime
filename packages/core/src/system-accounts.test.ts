import { describe, expect, it } from 'vitest';
import {
  CAI_ID,
  CHARACTER_HANDLES,
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
});
