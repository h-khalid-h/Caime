import { describe, expect, it } from 'vitest';
import { isPersonToken, redirectUriError } from './access';

describe('where an app may send someone back to (PRD §74)', () => {
  it('is https, loopback while building, or the app’s own scheme', () => {
    for (const ok of [
      'https://app.example.com/callback',
      'http://localhost:3000/callback',
      'http://127.0.0.1:8080/cb',
      'com.example.app://oauth',
      'myapp://callback',
    ])
      expect(redirectUriError(ok), ok).toBeNull();
  });

  it('is never script, data, a file, plain http elsewhere, a fragment or credentials', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'http://example.com/callback',
      'https://app.example.com/cb#token',
      'https://user:pass@app.example.com/cb',
      'not an address',
      'ab://x',
    ])
      expect(redirectUriError(bad), bad).not.toBeNull();
  });

  it('knows a token that acts as a person by its prefix', () => {
    expect(isPersonToken('cap_abc')).toBe(true);
    expect(isPersonToken('cao_abc')).toBe(true);
    expect(isPersonToken('car_abc')).toBe(false);
    expect(isPersonToken('cai_abc')).toBe(false);
  });
});
