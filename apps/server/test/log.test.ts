import { describe, expect, it } from 'vitest';
import { requestForLog } from '../src/lib/log';

describe('what a request says of itself in the log', () => {
  it('is its method and path, without a query string', () => {
    expect(
      requestForLog({ method: 'GET', url: '/v1/search?q=invoice&from=@sam', ip: '10.0.0.1' }),
    ).toEqual({ method: 'GET', url: '/v1/search', remoteAddress: '10.0.0.1' });
  });

  it('never a calendar feed’s address, which is its secret', () => {
    const secret = `cal_${'A1b2_C3d4-'.repeat(4)}xyz`;
    const logged = requestForLog({ method: 'GET', url: `/v1/calendar/${secret}.ics?x=1` });
    expect(logged.url).toBe('/v1/calendar/cal_….ics');
    expect(JSON.stringify(logged)).not.toContain(secret);
    // The feed's own settings are logged as they are.
    expect(requestForLog({ method: 'POST', url: '/v1/calendar/feed' }).url).toBe(
      '/v1/calendar/feed',
    );
  });

  it('never an invite’s token, which is the only key to it (R1)', () => {
    const token = 'Qm9vay1hLXRhYmxlLWZvci10d28';
    expect(requestForLog({ method: 'GET', url: `/i/${token}` }).url).toBe('/i/…');
    expect(requestForLog({ method: 'GET', url: `/v1/invites/${token}?x=1` }).url).toBe(
      '/v1/invites/…',
    );
    expect(requestForLog({ method: 'POST', url: `/v1/invites/${token}/accept` }).url).toBe(
      '/v1/invites/…/accept',
    );
    // The list of one's own, and short paths that aren't tokens, read as they are.
    expect(requestForLog({ method: 'GET', url: '/v1/invites' }).url).toBe('/v1/invites');
    expect(requestForLog({ method: 'GET', url: '/i/short' }).url).toBe('/i/short');
  });
});
