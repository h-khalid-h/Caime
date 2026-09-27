import { describe, expect, it } from 'vitest';
import { type CallOutcome, callDuration, callResult, callText } from './calls';
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

describe('a group call’s line', () => {
  it('says how long it lasted, or, when nobody else joined, who missed it', () => {
    expect(callText('video', 'completed', 720, false, true)).toBe('Group video call · 12 min');
    expect(callText('video', 'completed', 720, true, true)).toBe('Group video call · 12 min');
    expect(callText('voice', 'missed', 0, true, true)).toBe('Group voice call · no answer');
    expect(callText('voice', 'missed', 0, false, true)).toBe('Missed group voice call');
    expect(callText('voice', 'cancelled', 0, true, true)).toBe('Group voice call · cancelled');
    expect(callText('voice', 'cancelled', 0, false, true)).toBe('Missed group voice call');
  });
});

describe('a call, as it went for each person in it', () => {
  it('whoever calls is never told they were turned down', () => {
    expect(callResult({ outcome: 'completed', outgoing: true })).toBe('answered');
    expect(callResult({ outcome: 'declined', outgoing: true })).toBe('unanswered');
    expect(callResult({ outcome: 'missed', outgoing: true })).toBe('unanswered');
    expect(callResult({ outcome: 'cancelled', outgoing: true })).toBe('cancelled');
    expect(callResult({ outcome: 'failed', outgoing: true })).toBe('failed');
  });
  it('whoever was called missed it, turned it down or took it', () => {
    expect(callResult({ outcome: 'completed', outgoing: false })).toBe('answered');
    expect(callResult({ outcome: 'declined', outgoing: false })).toBe('declined');
    expect(callResult({ outcome: 'missed', outgoing: false })).toBe('missed');
    expect(callResult({ outcome: 'cancelled', outgoing: false })).toBe('missed');
  });
  it('in a group call, by whether they joined it', () => {
    const group = { group: true, outgoing: false };
    expect(callResult({ ...group, outcome: 'completed', joined: true })).toBe('answered');
    expect(callResult({ ...group, outcome: 'completed' })).toBe('missed');
    expect(callResult({ ...group, outcome: 'completed', declined: true })).toBe('declined');
    expect(callResult({ group: true, outgoing: true, outcome: 'missed', joined: true })).toBe(
      'unanswered',
    );
    expect(callResult({ group: true, outgoing: true, outcome: 'completed', joined: true })).toBe(
      'answered',
    );
  });
});
