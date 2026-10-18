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

  it('never a team invite’s token, which puts whoever has it on a team (M16 C3a)', () => {
    const token = `t_${'Qm9vay1hLXRhYmxl'.repeat(2)}LWZvci10d28Ab`;
    expect(requestForLog({ method: 'GET', url: `/t/${token}?lang=ar` }).url).toBe('/t/…');
    expect(requestForLog({ method: 'GET', url: `/v1/team-invites/${token}` }).url).toBe(
      '/v1/team-invites/…',
    );
    expect(requestForLog({ method: 'POST', url: `/v1/team-invites/${token}/accept` }).url).toBe(
      '/v1/team-invites/…/accept',
    );
    // The team's own list of them names no token.
    const list = '/v1/orgs/0d6c1a9e-1111-4222-8333-444455556666/invites';
    expect(requestForLog({ method: 'GET', url: list }).url).toBe(list);
  });

  it('never a join link’s token, which lets whoever has it into a group or a space (M16 C3e)', () => {
    const token = `g_${'Qm9vay1hLXRhYmxl'.repeat(2)}LWZvci10d28Ab`;
    expect(requestForLog({ method: 'GET', url: `/g/${token}?lang=fr` }).url).toBe('/g/…');
    expect(requestForLog({ method: 'GET', url: `/v1/join-links/${token}` }).url).toBe(
      '/v1/join-links/…',
    );
    expect(requestForLog({ method: 'POST', url: `/v1/join-links/${token}/accept` }).url).toBe(
      '/v1/join-links/…/accept',
    );
    // A place's own list of them names no token.
    const list = '/v1/conversations/0d6c1a9e-1111-4222-8333-444455556666/join-links';
    expect(requestForLog({ method: 'GET', url: list }).url).toBe(list);
  });

  it('never a meeting guest’s link, which is their way in (R84)', () => {
    const token = 'cmg_Qm9vay1hLXRhYmxlLWZvci10d28';
    expect(requestForLog({ method: 'GET', url: `/j/${token}` }).url).toBe('/j/…');
    expect(requestForLog({ method: 'GET', url: `/v1/join/${token}` }).url).toBe('/v1/join/…');
    expect(requestForLog({ method: 'POST', url: `/v1/join/${token}?x=1` }).url).toBe('/v1/join/…');
    // A mail's "Open in Caime" link (R75).
    expect(
      requestForLog({
        method: 'GET',
        url: '/v1/mail/seen/0d6c1a9e-1111-4222-8333-444455556666.abc',
      }).url,
    ).toBe('/v1/mail/seen/…');
    expect(requestForLog({ method: 'GET', url: '/j/short' }).url).toBe('/j/short');
  });
});
