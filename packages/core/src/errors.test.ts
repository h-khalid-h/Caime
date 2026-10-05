import { describe, expect, it } from 'vitest';
import { ERROR_CODES, isErrorCode } from './errors';

describe('error codes', () => {
  it('are snake_case, unique and sorted, and the common ones are there', () => {
    expect(ERROR_CODES.every((c) => /^[a-z]+(_[a-z]+)*$/.test(c))).toBe(true);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect([...ERROR_CODES]).toEqual([...ERROR_CODES].sort());
    for (const c of [
      'invalid_request',
      'unauthorized',
      'forbidden',
      'not_found',
      'rate_limited',
      'internal',
    ])
      expect(isErrorCode(c)).toBe(true);
    expect(isErrorCode('something_else')).toBe(false);
  });
});
