/**
 * A conversation as a model reads it (M16 D3): one transcript builder for Cai and the friends,
 * catch-up and ask, the brief and an organization's agent. Each reader chooses its messages (what
 * its person may read, `readableBy`) and how it names who spoke; what a message says and how a
 * line reads are written here, once.
 */
import { truncate, zonedParts } from '@caime/core';
import type { Message } from '../db/schema';
import { messagePreview } from './messages';

/** One line: who said it, when (where the reader needs it), what it answers, what it says. */
export interface TranscriptLine {
  who: string;
  words: string;
  /** "Wed 23 Sep 14:05" on the reader's clock (`transcriptClock`). */
  at?: string;
  /** The number of the line it replies to, when that line is in the transcript too. */
  replyTo?: number;
}

/** The kinds whose body is someone's words: a text, a caption, a voice note's transcript. */
const SAYS = new Set(['text', 'media', 'file', 'voice']);

/**
 * What a message says: someone's words whole (a text, a photo's or a file's caption, a voice
 * note's transcript, which `lib/transcribe.ts` keeps as its body), else what it is ("📷 Photo",
 * "Meeting: Venue walkthrough"); its spaces made single and its line breaks kept, cut at `max`
 * characters (never half of one).
 */
export function wordsFor(
  m: Pick<Message, 'kind' | 'body' | 'payload' | 'deleted_at'>,
  max: number,
): string {
  const said = m.body?.trim();
  const words = said && SAYS.has(m.kind) ? said : messagePreview(m);
  return truncate(
    words
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n[\s]*/g, '\n')
      .trim(),
    max,
  );
}

/** The lines, numbered from 1: "[n] Wed 23 Sep 14:05 · Noor: (replying to [2]) words", a break as ⏎. */
export function transcriptText(lines: TranscriptLine[]): string {
  return lines
    .map(
      (l, i) =>
        `[${i + 1}] ${l.at ? `${l.at} · ` : ''}${l.who}: ${
          l.replyTo ? `(replying to [${l.replyTo}]) ` : ''
        }${l.words.replace(/\n/g, ' ⏎ ')}`,
    )
    .join('\n');
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const two = (n: number) => String(n).padStart(2, '0');

/**
 * A transcript's times on the reader's clock, in English (what the model reads), the same on
 * every ICU version: "Wed 23 Sep 14:05", and today as "Wednesday 23 September 2026".
 */
export function transcriptClock(timeZone: string) {
  return {
    time: (d: Date) => {
      const p = zonedParts(d, timeZone);
      return `${DAYS[p.weekday]?.slice(0, 3)} ${p.day} ${MONTHS[p.month - 1]?.slice(0, 3)} ${two(p.hour)}:${two(p.minute)}`;
    },
    day: (d: Date) => {
      const p = zonedParts(d, timeZone);
      return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
    },
  };
}
