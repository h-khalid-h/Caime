/**
 * A call's notes read as turns (M17 F8a): a speaker's lines one after another, with nobody else
 * between them and less than a minute apart, are one paragraph under one name and one time, as a
 * note-taker writes them; each line stays its own underneath, which is what a person deletes.
 */
import type { CallNoteLineView } from '@caime/core/api';

/** A minute with nothing from anyone starts a speaker's next paragraph. */
export const TURN_GAP_MS = 60_000;

export interface Turn {
  /** The first line's id, which keys the turn. */
  id: string;
  speaker: CallNoteLineView['speaker'];
  mine: boolean;
  /** When the turn began: its first line's time. */
  at: string;
  lines: CallNoteLineView[];
}

/** The lines, in the order they were said, as turns. */
export function turnsOf(lines: readonly CallNoteLineView[]): Turn[] {
  const turns: Turn[] = [];
  let last: CallNoteLineView | null = null;
  for (const line of lines) {
    const current = turns[turns.length - 1];
    const joins =
      current &&
      last &&
      current.speaker.id === line.speaker.id &&
      Date.parse(line.at) - Date.parse(last.at) < TURN_GAP_MS;
    if (current && joins) current.lines.push(line);
    else
      turns.push({
        id: line.id,
        speaker: line.speaker,
        mine: line.mine,
        at: line.at,
        lines: [line],
      });
    last = line;
  }
  return turns;
}

/** A turn's words as one paragraph; null while none of it is written yet. */
export function turnText(turn: Turn): string | null {
  const heard = turn.lines.map((l) => l.text).filter((t): t is string => Boolean(t));
  return heard.length ? heard.join(' ') : null;
}

/** How many of a turn's lines Cai is still writing. */
export const stillWriting = (turn: Turn) => turn.lines.filter((l) => l.text === null).length;
