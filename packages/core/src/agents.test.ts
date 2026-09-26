import { describe, expect, it } from 'vitest';
import { AGENT_NAME_MAX, defaultAgentName } from './agents';

describe('AI agents (PRD §75)', () => {
  it('are named for the organization they answer for, within the name limit', () => {
    expect(defaultAgentName('Nile Dental')).toBe('Nile Dental Assistant');
    expect(defaultAgentName('  Nile Dental  ')).toBe('Nile Dental Assistant');
    const long = defaultAgentName('The Very Long Name of a Family Dental Practice in Cairo');
    expect(long.length).toBeLessThanOrEqual(AGENT_NAME_MAX);
  });
});
