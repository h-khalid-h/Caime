import { describe, expect, it } from 'vitest';
import { setupNextLine, setupSteps } from './setupSteps';

const fresh = { booking: null, memberCount: 1, verified: false, agent: null };
const hours = { timeZone: 'Africa/Cairo', slotMinutes: 30, days: [] };

describe('setting an organization up (R57, M16 C2b)', () => {
  it('lists the steps in the order that lets customers in soonest', () => {
    expect(setupSteps(fresh).map((s) => s.key)).toEqual(['hours', 'team', 'verify', 'agent']);
    expect(setupSteps(fresh).every((s) => !s.done)).toBe(true);
  });

  it('says the first step still to take, and never stalls at the domain', () => {
    expect(setupNextLine(fresh)).toBe('Next: set bookable hours');
    // Hours set, alone on the team: the team comes before the domain.
    expect(setupNextLine({ ...fresh, booking: hours as never })).toBe('Next: invite your team');
    // Verified first (a clinic with a domain): its hours are still what's next.
    expect(setupNextLine({ ...fresh, verified: true })).toBe('Next: set bookable hours');
    const team = { ...fresh, booking: hours as never, memberCount: 3 };
    expect(setupNextLine(team)).toBe('Next: verify your domain');
    expect(setupNextLine({ ...team, verified: true })).toBe('Next: an AI agent that answers first');
    expect(setupNextLine({ ...team, verified: true, agent: { name: 'Nour' } })).toBe(
      'Your door, domain, customers’ data, hours, AI agent, apps and plan',
    );
  });

  it('counts the team by its people: the owner alone has a team still to invite', () => {
    const steps = setupSteps({ ...fresh, memberCount: 2 });
    expect(steps.find((s) => s.key === 'team')?.done).toBe(true);
  });
});
