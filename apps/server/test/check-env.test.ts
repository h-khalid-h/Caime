/**
 * The environment check (2026-10-14): production's configuration went invalid while the host
 * still reported each deployment as done. It names what fails and what's set twice, never a
 * value.
 */
import { describe, expect, it } from 'vitest';
import { failingNames, readEnvFile } from '../src/check-env';

const BASE = [
  'DATABASE_URL=postgres://u:p@db:5432/caime',
  'PUBLIC_URL=https://cai.me',
  'SESSION_SECRET=a-long-enough-secret-for-the-tests-0123456789',
].join('\n');

describe('the environment check', () => {
  it('passes a valid file and names what is set twice, the last line winning', () => {
    const { env, twice } = readEnvFile(
      `${BASE}\n# a note\nEMAIL_FROM=Caime <a@cai.me>\nEMAIL_FROM="Caime <hello@cai.me>"\n`,
    );
    expect(twice).toEqual(['EMAIL_FROM']);
    expect(env.EMAIL_FROM).toBe('Caime <hello@cai.me>');
    expect(failingNames(env)).toEqual([]);
  });

  it('names a minimum age below 13 and an SMTP_URL that is not an address, never their values', () => {
    const { env } = readEnvFile(
      `${BASE}\nMINIMUM_AGE=10\nSMTP_URL=smtp://t:t@smtp.postmarkapp.com:587\nSMTP_URL=the server token, port 587\n`,
    );
    const failing = failingNames(env);
    expect(failing.sort()).toEqual(['MINIMUM_AGE', 'SMTP_URL']);
    expect(failing.join(' ')).not.toContain('587');
  });
});
