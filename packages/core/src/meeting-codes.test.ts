import { describe, expect, it } from 'vitest';
import {
  MEETING_CODE_LENGTH,
  MEETING_CODE_LETTERS,
  meetingCodeIn,
  meetingCodePath,
  shownMeetingCode,
} from './meeting-codes';

describe("a meeting's short address (M16 F6d)", () => {
  it('is shown three, four, three, and read back however it was written', () => {
    expect(shownMeetingCode('hzwtcsihst')).toBe('hzw-tcsi-hst');
    expect(meetingCodePath('hzwtcsihst')).toBe('/m/hzw-tcsi-hst');
    for (const written of ['hzw-tcsi-hst', 'HZW-TCSI-HST', ' hzwtcsihst ', 'hzw-tcsihst'])
      expect(meetingCodeIn(written)).toBe('hzwtcsihst');
  });

  it('is nothing else: another length, a digit, a letter that reads as another', () => {
    for (const written of [
      '',
      null,
      'hzw-tcsi-hs',
      'hzw-tcsi-hstx',
      'hzw-tcs1-hst',
      'hzw-tcsl-hst',
      'hzw-tcso-hst',
    ])
      expect(meetingCodeIn(written)).toBeNull();
    expect(MEETING_CODE_LETTERS).not.toMatch(/[lo]/);
    expect(new Set(MEETING_CODE_LETTERS).size).toBe(MEETING_CODE_LETTERS.length);
    // Some 10^13 codes: two cards meet one in a few hundred billion.
    expect(MEETING_CODE_LETTERS.length ** MEETING_CODE_LENGTH).toBeGreaterThan(6e13);
  });
});
