import { describe, expect, it } from 'vitest';
import { chatExportText } from './chat-export';
import { parseWhatsApp } from './whatsapp';

const at = (day: number, hour: number, minute: number) => ({
  year: 2026,
  month: 10,
  day,
  hour,
  minute,
});

describe('a conversation as a text file (M16 E7)', () => {
  it('writes WhatsApp’s line, the year first', () => {
    expect(chatExportText([{ at: at(3, 9, 5), author: 'Noor Haddad', text: 'On my way' }])).toBe(
      '2026-10-03, 09:05 - Noor Haddad: On my way\n',
    );
    expect(chatExportText([])).toBe('');
  });

  it('reads back through the WhatsApp importer: who, when and every line of the words', () => {
    const text = chatExportText([
      {
        at: at(21, 14, 5),
        author: 'Noor Haddad',
        text: 'The invoice:\nINV-7731\n\nPaid by Friday?',
      },
      { at: at(21, 14, 7), author: 'Alex: Reads', text: 'نعم، يوم الجمعة' },
      { at: at(22, 8, 0), author: 'Noor Haddad', text: '📷 Photo' },
    ]);
    const chat = parseWhatsApp(text);
    expect(chat.messages.map((m) => [m.author, m.text])).toEqual([
      ['Noor Haddad', 'The invoice:\nINV-7731\n\nPaid by Friday?'],
      // A colon in a name would end it early: it goes.
      ['Alex Reads', 'نعم، يوم الجمعة'],
      ['Noor Haddad', '📷 Photo'],
    ]);
    expect(chat.messages[0]?.at).toEqual(new Date(2026, 9, 21, 14, 5));
    expect(chat.system).toBe(0);
  });
});
