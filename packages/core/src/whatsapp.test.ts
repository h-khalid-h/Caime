import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_TEXT } from './imports';
import { type ImportedMessage, otherAuthor, parseWhatsApp } from './whatsapp';

const android = [
  '13/03/2024, 09:01 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  '13/03/2024, 09:02 - Noor Haddad: Morning! Are we still on for the clinic tomorrow?',
  '13/03/2024, 09:05 - Alex Chen: Yes, 10:30.',
  'I’ll bring the forms',
  '',
  'and the scan.',
  '13/03/2024, 09:06 - Alex Chen: <Media omitted>',
  '14/03/2024, 10:31 - Noor Haddad: Here now',
].join('\n');

describe('a WhatsApp export', () => {
  it('reads Android’s lines, continuations, and what the export left out', () => {
    const chat = parseWhatsApp(android);
    expect(chat.authors).toEqual(['Noor Haddad', 'Alex Chen']);
    expect(chat.system).toBe(1);
    expect(chat.mediaOmitted).toBe(1);
    expect(chat.skipped).toBe(0);
    expect(chat.dayFirst).toBe(true);
    expect(chat.ambiguous).toBe(false);
    expect(chat.messages.map((m) => m.text)).toEqual([
      'Morning! Are we still on for the clinic tomorrow?',
      'Yes, 10:30.\nI’ll bring the forms\n\nand the scan.',
      'Here now',
    ]);
    const first = chat.messages[0]!;
    expect([first.at.getFullYear(), first.at.getMonth(), first.at.getDate()]).toEqual([
      2024, 2, 13,
    ]);
    expect([first.at.getHours(), first.at.getMinutes()]).toEqual([9, 2]);
    expect(otherAuthor(chat, 'Noor Haddad')).toBe('Alex Chen');
  });

  it('reads iOS’s brackets, seconds, 12-hour clocks and the marks phones leave', () => {
    const ios = [
      '‎[3/12/24, 2:05:07 PM] Noor Haddad: On my way',
      '[3/12/24, 11:59:59 PM] Alex Chen: ‎image omitted',
      '[3/12/24, 12:01:00 AM] Alex Chen: Got it',
      '[3/25/24, 12:30:00 PM] Noor Haddad: Lunch?',
    ].join('\n');
    const chat = parseWhatsApp(ios);
    expect(chat.dayFirst).toBe(false);
    expect(chat.ambiguous).toBe(false);
    expect(chat.mediaOmitted).toBe(1);
    const [a, b, c] = chat.messages as [ImportedMessage, ImportedMessage, ImportedMessage];
    expect([a.at.getMonth(), a.at.getDate(), a.at.getHours(), a.at.getSeconds()]).toEqual([
      2, 12, 14, 7,
    ]);
    expect(b.at.getHours()).toBe(0); // 12:01 AM
    expect([c.at.getMonth(), c.at.getDate(), c.at.getHours()]).toEqual([2, 25, 12]);
  });

  it('guesses day first when every date fits both, unless told otherwise', () => {
    const text = '01/02/2024, 10:00 - Noor Haddad: hi\n02/02/2024, 10:00 - Alex Chen: hey';
    const guessed = parseWhatsApp(text);
    expect(guessed.ambiguous).toBe(true);
    expect(guessed.dayFirst).toBe(true);
    expect(guessed.messages[0]?.at.getMonth()).toBe(1);
    const told = parseWhatsApp(text, { dayFirst: false });
    expect(told.ambiguous).toBe(true);
    expect(told.messages[0]?.at.getMonth()).toBe(0);
    expect(told.messages[1]?.at.getDate()).toBe(2);
  });

  it('reads a year-first file and dotted dates', () => {
    const chat = parseWhatsApp('2024-03-13 09:02 - Noor Haddad: a\n13.03.24, 09:03 - Alex Chen: b');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]?.at.getFullYear()).toBe(2024);
    expect(chat.messages[1]?.at.getDate()).toBe(13);
  });

  it('skips what isn’t a chat, and drops what isn’t a date', () => {
    const chat = parseWhatsApp(
      'Some header\n\n32/13/2024, 10:00 - Nobody: x\n13/03/2024, 25:00 - Nobody: y\n13/03/2024, 10:00 - Noor Haddad: ok',
    );
    expect(chat.skipped).toBe(3);
    expect(chat.messages.map((m) => m.text)).toEqual(['ok']);
    expect(parseWhatsApp('')).toMatchObject({ messages: [], authors: [], skipped: 0 });
    expect(parseWhatsApp('just words').skipped).toBe(1);
  });

  it('cuts a message longer than the limit, and drops one left empty', () => {
    const long = 'x'.repeat(IMPORT_MAX_TEXT + 50);
    const chat = parseWhatsApp(
      `13/03/2024, 10:00 - Noor Haddad: ${long}\n13/03/2024, 10:01 - Alex Chen:  \n   `,
    );
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]?.text).toHaveLength(IMPORT_MAX_TEXT);
  });

  it('knows a group export from a one-to-one', () => {
    const chat = parseWhatsApp(
      '13/03/2024, 10:00 - Noor Haddad: a\n13/03/2024, 10:01 - Alex Chen: b\n13/03/2024, 10:02 - Lina: c\n13/03/2024, 10:03 - Lina: d',
    );
    expect(chat.authors).toEqual(['Lina', 'Noor Haddad', 'Alex Chen']);
    expect(otherAuthor(chat, 'Noor Haddad')).toBeNull();
  });

  it('keeps a colon inside a message with its author', () => {
    const chat = parseWhatsApp('13/03/2024, 10:00 - Noor Haddad: Note: bring ID: passport');
    expect(chat.messages[0]).toMatchObject({
      author: 'Noor Haddad',
      text: 'Note: bring ID: passport',
    });
  });
});
