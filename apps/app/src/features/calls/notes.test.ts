/**
 * Where Cai's notes cut what's said (M16 F7, R82 (2)): an utterance starts after a quarter of a
 * second of speech above the room, ends after a second and a half of quiet (M17 F8a), past twenty
 * seconds at the next breath, is cut at its longest, and the room's own level is learnt without
 * speech ever becoming it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/endpoints', () => ({ endpoints: {} }));
vi.mock('@/api/client', () => ({ ApiError: class extends Error {} }));
vi.mock('@/ui/Toast', () => ({ toast: vi.fn() }));
vi.mock('@/state/session', () => ({ useSession: { getState: () => ({ user: null }) } }));

const { levelDb, step, stopLine } = await import('./notes');

type State = Parameters<typeof step>[0];
const quiet = -70;
const speech = -25;

/** Feed levels a tick at a time, as the recorder does, and say where it started and ended. */
function run(levels: number[], from: Partial<State> = {}) {
  let s: State = { room: -50, above: 0, below: 0, speaking: false, speakingMs: 0, ...from };
  const marks: string[] = [];
  levels.forEach((db, i) => {
    const next = step(s, db);
    if (next.start) marks.push(`start@${i}`);
    if (next.end) marks.push(`end@${i}`);
    if (next.cut) marks.push(`cut@${i}`);
    const speaking = next.start || next.cut ? true : next.end ? false : s.speaking;
    s = {
      room: next.room,
      above: next.above,
      below: next.below,
      speaking,
      speakingMs: speaking ? (next.start || next.cut ? 0 : s.speakingMs + 50) : 0,
    };
  });
  return marks;
}

describe('cutting what’s said at its pauses (R82 (2))', () => {
  it('starts after a quarter of a second of speech, and ends after a second and a half of quiet', () => {
    const levels = [...Array(10).fill(quiet), ...Array(20).fill(speech), ...Array(35).fill(quiet)];
    // Five ticks of speech (250 ms) start it; thirty of quiet (1,500 ms) end it.
    expect(run(levels)).toEqual(['start@14', 'end@59']);
  });

  it('keeps a sentence whole through a pause of a second (M17 F8a)', () => {
    const levels = [
      ...Array(20).fill(speech),
      ...Array(20).fill(quiet),
      ...Array(20).fill(speech),
      ...Array(35).fill(quiet),
    ];
    expect(run(levels)).toEqual(['start@4', 'end@89']);
  });

  it('past twenty seconds, ends at the next breath rather than mid-word', () => {
    const levels = [...Array(420).fill(speech), ...Array(6).fill(quiet), ...Array(40).fill(speech)];
    // Twenty seconds in (tick 404), the first six ticks of quiet (300 ms) end it.
    expect(run(levels)).toEqual(['start@4', 'end@425', 'start@430']);
  });

  it('never starts on a click, a breath or a door', () => {
    const blips = Array.from({ length: 40 }, (_, i) => (i % 8 < 3 ? speech : quiet));
    expect(run(blips)).toEqual([]);
  });

  it('keeps going through the gaps between words', () => {
    const levels = [
      ...Array(10).fill(speech),
      ...Array(10).fill(quiet),
      ...Array(10).fill(speech),
      ...Array(30).fill(quiet),
    ];
    expect(run(levels)).toEqual(['start@4', 'end@59']);
  });

  it('cuts at half a minute while still speaking, and the next part starts at once', () => {
    const levels = Array(620).fill(speech);
    expect(run(levels)).toEqual(['start@4', 'cut@605']);
  });

  it('hears speech over a noisy room, and the room never becomes speech', () => {
    const noisy = -40;
    const levels = [
      ...Array(40).fill(noisy),
      ...Array(10).fill(noisy + 15),
      ...Array(40).fill(noisy),
    ];
    expect(run(levels, { room: noisy })).toEqual(['start@44', 'end@79']);
  });

  it('reads a level in decibels', () => {
    expect(levelDb(new Float32Array(64).fill(0))).toBe(-120);
    expect(Math.round(levelDb(new Float32Array(64).fill(0.1)))).toBe(-20);
  });
});

describe('why Cai stopped, in words that name nobody (R85)', () => {
  const notes = (why: string, state = 'stopped', records = false) =>
    ({
      id: 'n',
      state,
      askedBy: { id: 'a', displayName: 'Noor' },
      yes: [],
      waitingOn: [],
      recorderDevice: null,
      records,
      startedAt: null,
      stoppedAt: null,
      why,
      switching: null,
    }) as Parameters<typeof stopLine>[0];
  it('says each reason, and nothing when the call simply ended', () => {
    expect(stopLine(notes('declined', 'declined'))).toBe('Not this time: Cai isn’t taking notes.');
    expect(stopLine(notes('joined_without'))).toBe(
      'Someone is in the call without Cai, so Cai stopped taking notes.',
    );
    expect(stopLine(notes('stopped'))).toBe('Cai stopped taking notes.');
    expect(stopLine(notes('ended'))).toBeNull();
    expect(stopLine(notes('stopped', 'on'))).toBeNull();
    // A recording says it's the recording that stopped (R114).
    expect(stopLine(notes('declined', 'declined', true))).toBe(
      'Not this time: Cai isn’t recording.',
    );
    expect(stopLine(notes('joined_without', 'stopped', true))).toBe(
      'Someone is in the call without Cai, so Cai stopped recording.',
    );
    expect(stopLine(notes('stopped', 'stopped', true))).toBe('Cai stopped recording.');
  });
});
