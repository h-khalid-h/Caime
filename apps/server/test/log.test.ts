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
});
