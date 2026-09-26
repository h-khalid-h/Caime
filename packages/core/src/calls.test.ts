import { describe, expect, it } from 'vitest';
import { type CallOutcome, callDuration, callText } from './calls';
import { systemText } from './format';

describe('calls (PRD §47)', () => {
  it('say how long two people talked', () => {
    expect(callDuration(20)).toBe('under a minute');
    expect(callDuration(250)).toBe('4 min');
    expect(callDuration(3900)).toBe('1 h 5 min');
    expect(callDuration(7200)).toBe('2 h');
  });

  it('leave a line each side reads its own way', () => {
    const line = (outcome: CallOutcome, viewer: string) =>
      systemText({ event: 'call', kind: 'video', outcome, seconds: 250, byId: 'noor' }, viewer);
    expect(line('completed', 'noor')).toBe('Video call · 4 min');
    expect(line('completed', 'sam')).toBe('Video call · 4 min');
    expect(line('missed', 'sam')).toBe('Missed video call');
    expect(line('missed', 'noor')).toBe('Video call · no answer');
    expect(line('declined', 'sam')).toBe('You declined a video call');
    expect(line('declined', 'noor')).toBe('Video call · no answer');
    expect(line('cancelled', 'sam')).toBe('Missed video call');
    expect(line('cancelled', 'noor')).toBe('Video call · cancelled');
    expect(line('failed', 'sam')).toBe('Video call · couldn’t connect');
    expect(callText('voice', 'missed', 0, false)).toBe('Missed voice call');
  });
});
