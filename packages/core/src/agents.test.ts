import { describe, expect, it } from 'vitest';
import { AGENT_NAME_MAX, defaultAgentName, knowledgePassages } from './agents';

describe('AI agents (PRD §75)', () => {
  it('are named for the organization they answer for, within the name limit', () => {
    expect(defaultAgentName('Nile Dental')).toBe('Nile Dental Assistant');
    expect(defaultAgentName('  Nile Dental  ')).toBe('Nile Dental Assistant');
    const long = defaultAgentName('The Very Long Name of a Family Dental Practice in Cairo');
    expect(long.length).toBeLessThanOrEqual(AGENT_NAME_MAX);
  });
});

describe('what an agent was told, as the passages its answers cite (M16 G6a)', () => {
  it('is a sentence a passage, line by line, in order, with every word kept', () => {
    const told = [
      'Open Sunday to Thursday 9:30 to 6.  A check-up is 400 EGP!',
      '',
      '   Do you take walk-ins? No.',
      'هل تقبلون المواعيد بدون حجز؟ لا.',
      'Prices in EGP',
    ].join('\r\n');
    expect(knowledgePassages(told)).toEqual([
      'Open Sunday to Thursday 9:30 to 6.',
      'A check-up is 400 EGP!',
      'Do you take walk-ins?',
      'No.',
      'هل تقبلون المواعيد بدون حجز؟',
      'لا.',
      'Prices in EGP',
    ]);
    // A number's point isn't a sentence's end, and nothing is lost between passages.
    expect(knowledgePassages('A filling is 250.50 EGP.')).toEqual(['A filling is 250.50 EGP.']);
    expect(knowledgePassages(told).join(' ').replace(/\s+/g, '')).toBe(told.replace(/\s+/g, ''));
    expect(knowledgePassages('  \n ')).toEqual([]);
  });
});
