import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createTestApp } from './helpers';

describe('About: where this Caishy keeps its policies and help', () => {
  it('links where its operator put them, and to nothing it wasn’t given', async () => {
    const t = await createTestApp({
      PRIVACY_URL: 'https://policies.example/privacy',
      HELP_URL: 'https://help.example/caishy',
    });
    try {
      const res = await t.app.inject({ method: 'GET', url: '/v1/about' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        privacyUrl: 'https://policies.example/privacy',
        termsUrl: null,
        helpUrl: 'https://help.example/caishy',
      });
    } finally {
      await t.close();
    }
  });

  it('takes only an http(s) address for each', () => {
    const env = { DATABASE_URL: 'postgres://caishy@localhost/caishy' };
    expect(loadConfig(env).aboutLinks).toEqual({ privacyUrl: null, termsUrl: null, helpUrl: null });
    for (const TERMS_URL of ['javascript:alert(1)', '/terms', 'caishy.com/terms'])
      expect(() => loadConfig({ ...env, TERMS_URL }), TERMS_URL).toThrow(/TERMS_URL/);
  });
});
