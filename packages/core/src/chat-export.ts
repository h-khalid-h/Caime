/**
 * One conversation as a text file (M16 E7, the review's parity "per-chat export"): a line per
 * message in WhatsApp's own shape, the year first so no reader takes a day for a month,
 *
 *   2026-10-21, 14:05 - Noor Haddad: On my way
 *
 * a message's later lines below its first, as WhatsApp writes them, so the file reads back
 * through `parseWhatsApp` (Caime's own importer, and anyone else's that reads WhatsApp). Pure: the
 * server fills the clock's parts on the reader's own clock.
 */

/** A message as its export says it: when (on the reader's clock), who, and its words. */
export interface ExportLine {
  at: { year: number; month: number; day: number; hour: number; minute: number };
  author: string;
  text: string;
}

const two = (n: number) => String(n).padStart(2, '0');

/** A name as a line can carry it: a colon would end it early, and a line break the line. */
const nameOf = (author: string) =>
  author
    .replace(/[:\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '?';

export function chatExportText(lines: readonly ExportLine[]): string {
  return lines
    .map(({ at, author, text }) => {
      const when = `${at.year}-${two(at.month)}-${two(at.day)}, ${two(at.hour)}:${two(at.minute)}`;
      return `${when} - ${nameOf(author)}: ${text.replace(/\r\n?/g, '\n')}`;
    })
    .join('\n')
    .concat(lines.length ? '\n' : '');
}
