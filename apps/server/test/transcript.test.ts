import { describe, expect, it } from 'vitest';
import { transcriptClock, transcriptText, wordsFor } from '../src/lib/transcript';

/**
 * A conversation as a model reads it (M16 D3): one rule for what a message says and one way a
 * line reads, for Cai and the friends, catch-up and ask, the brief and an organization's agent.
 */
const message = (kind: string, body: string | null) =>
  ({ kind, body, payload: {}, deleted_at: null }) as Parameters<typeof wordsFor>[0];

describe('a conversation as a model reads it (M16 D3)', () => {
  it('takes a voice note by its words, a caption whole, and anything else by what it is', () => {
    // A transcribed voice note's words are its body (lib/transcribe.ts): they were read as
    // "🎙 Voice message", and a caption was cut at 80 characters.
    expect(wordsFor(message('voice', 'Remember the dentist on Friday'), 600)).toBe(
      'Remember the dentist on Friday',
    );
    expect(wordsFor(message('voice', null), 600)).toBe('🎙 Voice message');
    const caption = 'The venue seen from the north gate, where we meet at six.'.repeat(3);
    expect(wordsFor(message('media', caption), 600)).toBe(caption);
    expect(wordsFor(message('text', 'one   two\n\n  three'), 600)).toBe('one two\nthree');
    // Cut by character, never through one.
    expect(wordsFor(message('text', '👍'.repeat(10)), 5)).toBe('👍👍👍👍…');
  });

  it('writes every line the same way, with the time on the reader’s clock', () => {
    expect(
      transcriptText([
        { at: 'Wed 23 Sep 14:05', who: 'Noor', words: 'Hi\nthere' },
        { who: 'You', words: 'Yes', replyTo: 1 },
      ]),
    ).toBe('[1] Wed 23 Sep 14:05 · Noor: Hi ⏎ there\n[2] You: (replying to [1]) Yes');
    const clock = transcriptClock('Africa/Cairo');
    expect(clock.time(new Date('2026-09-23T11:05:00Z'))).toBe('Wed 23 Sep 14:05');
    expect(clock.day(new Date('2026-09-23T11:05:00Z'))).toBe('Wednesday 23 September 2026');
  });
});
