import { isReservedHandle } from '@caime/core';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';

describe('the characters', () => {
  it('are each a handle nobody can take, so no account can pose as one (R35)', () => {
    for (const character of CHARACTERS) expect(isReservedHandle(character), character).toBe(true);
  });
});
