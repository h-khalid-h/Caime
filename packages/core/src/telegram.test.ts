import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_TEXT } from './imports';
import { looksLikeTelegram, parseTelegram } from './telegram';

const at = (date: string, from: string, text: unknown, more: Record<string, unknown> = {}) => ({
  id: Math.floor(Math.random() * 1e6),
  type: 'message',
  date,
  date_unixtime: '0',
  from,
  from_id: `user_${from.replace(/\s/g, '')}`,
  text,
  ...more,
});

const chat = (messages: unknown[], more: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'Alex Chen', type: 'personal_chat', id: 1, messages, ...more });

describe('parseTelegram', () => {
  it('reads a personal chat: words as a string or in pieces, in the file order, dated as written', () => {
    const read = parseTelegram(
      chat([
        at('2024-03-13T09:02:00', 'Noor Haddad', 'Morning! Still on for the clinic tomorrow?'),
        at('2024-03-13T09:05:30', 'Alex Chen', [
          'Yes, 10:30. Call me at ',
          { type: 'phone', text: '+20 100 000 0000' },
          ' if anything changes.',
        ]),
        at('2024-03-13T09:06:00', 'Alex Chen', [{ type: 'bold', text: 'Bring' }, ' the forms.']),
      ]),
    );
    expect(read).not.toBeNull();
    expect(read?.messages.map((m) => [m.author, m.text])).toEqual([
      ['Noor Haddad', 'Morning! Still on for the clinic tomorrow?'],
      ['Alex Chen', 'Yes, 10:30. Call me at +20 100 000 0000 if anything changes.'],
      ['Alex Chen', 'Bring the forms.'],
    ]);
    // The exporting computer's own clock, as a phone's is for WhatsApp.
    expect(read?.messages[1]?.at).toEqual(new Date(2024, 2, 13, 9, 5, 30));
    // Most messages first.
    expect(read?.authors).toEqual(['Alex Chen', 'Noor Haddad']);
    expect(read).toMatchObject({ system: 0, mediaOmitted: 0, skipped: 0, ambiguous: false });
  });

  it('counts media left out (its caption kept), Telegram’s own lines, and what it can’t read', () => {
    const read = parseTelegram(
      chat([
        {
          id: 1,
          type: 'service',
          date: '2024-03-13T09:00:00',
          actor: 'Noor Haddad',
          action: 'pin_message',
          text: '',
        },
        at('2024-03-13T09:01:00', 'Alex Chen', '', { photo: 'photos/photo_1.jpg' }),
        at('2024-03-13T09:02:00', 'Alex Chen', 'The signed form', {
          file: 'files/form.pdf',
          mime_type: 'application/pdf',
        }),
        at('2024-03-13T09:03:00', 'Alex Chen', '', {
          media_type: 'voice_message',
          file: 'voice_messages/1.ogg',
        }),
        { id: 5, type: 'message', date: 'not a date', from: 'Alex Chen', text: 'lost' },
        { id: 6, type: 'message', date: '2024-03-13T09:04:00', text: 'nobody wrote this' },
        at('2024-03-13T09:05:00', 'Noor Haddad', 'Got it'),
      ]),
    );
    expect(read?.messages.map((m) => m.text)).toEqual(['The signed form', 'Got it']);
    expect(read).toMatchObject({ system: 1, mediaOmitted: 3, skipped: 2 });
  });

  it('reads an account’s export when it holds one chat, and nothing that isn’t a chat', () => {
    const one = JSON.stringify({
      about: 'Here is the data you requested.',
      chats: { list: [JSON.parse(chat([at('2024-03-13T09:02:00', 'Noor Haddad', 'Hi')]))] },
    });
    expect(parseTelegram(one)?.messages).toHaveLength(1);
    const two = JSON.stringify({ chats: { list: [{ messages: [] }, { messages: [] }] } });
    expect(parseTelegram(two)).toBeNull();
    expect(parseTelegram('{"name":"x"}')).toBeNull();
    expect(parseTelegram('13/03/2024, 09:02 - Noor Haddad: Morning!')).toBeNull();
    expect(parseTelegram('')).toBeNull();
  });

  it('cuts a message at the import’s limit, as WhatsApp’s reader does', () => {
    const read = parseTelegram(
      chat([at('2024-03-13T09:02:00', 'Noor Haddad', 'x'.repeat(IMPORT_MAX_TEXT + 50))]),
    );
    expect(read?.messages[0]?.text).toHaveLength(IMPORT_MAX_TEXT);
  });

  it('tells Telegram’s file from WhatsApp’s', () => {
    expect(looksLikeTelegram('  {"name":"Alex"}')).toBe(true);
    expect(looksLikeTelegram('13/03/2024, 09:02 - Noor: Hi')).toBe(false);
  });
});
