import type { MessageView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { buildRows, importedAuthor } from './rows';

const ME = 'me-0000';
const line = (seq: number, at: string, payload: Record<string, unknown>) =>
  ({
    id: `m${seq}`,
    seq,
    clientId: null,
    senderId: ME,
    kind: 'text',
    body: `line ${seq}`,
    payload,
    createdAt: at,
  }) as unknown as MessageView;

describe('a WhatsApp group brought over (M16 C3g)', () => {
  it('draws a name kept as nobody here as that name’s line, never as the importer’s', () => {
    const imported = { source: 'whatsapp', by: ME };
    const sami = { imported: { ...imported, author: 'Uncle Sami' } };
    const messages = [
      line(1, '2024-05-01T18:00:00.000Z', { imported }),
      line(2, '2024-05-01T18:01:00.000Z', sami),
      line(3, '2024-05-01T18:02:00.000Z', sami),
    ];
    expect(importedAuthor(messages[1] as MessageView)).toBe('Uncle Sami');
    expect(importedAuthor(messages[0] as MessageView)).toBeNull();
    const rows = buildRows({
      messages,
      pending: [],
      conversation: undefined,
      me: ME,
      unreadFrom: null,
      now: new Date('2024-05-02T09:00:00.000Z'),
      timeZone: 'UTC',
      locale: 'en-GB',
    })
      .filter((r) => r.type === 'message')
      .reverse();
    // The importer's own line is theirs; Uncle Sami's two read as one run of his, named.
    expect(rows.map((r) => (r.type === 'message' ? [r.mine, r.senderName, r.first] : []))).toEqual([
      [true, null, true],
      [false, 'Uncle Sami', true],
      [false, 'Uncle Sami', false],
    ]);
  });
});

describe('a group of many (M16 D2b)', () => {
  it('draws one tick, whoever has read, where nothing tells the sender', () => {
    const people = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        userId: i === 0 ? ME : `p${i}`,
        role: i === 0 ? 'owner' : 'member',
        person: { id: i === 0 ? ME : `p${i}`, displayName: `Person ${i}` },
        readSeq: 1,
        deliveredSeq: 1,
      }));
    const conversation = (n: number) =>
      ({ kind: 'group', business: null, participants: people(n) }) as never;
    const delivery = (n: number) =>
      buildRows({
        messages: [line(1, '2024-05-01T18:00:00.000Z', {})],
        pending: [],
        conversation: conversation(n),
        me: ME,
        unreadFrom: null,
        now: new Date('2024-05-02T09:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en-GB',
      }).flatMap((r) => (r.type === 'message' ? [r.delivery] : []))[0];
    expect(delivery(100)).toBe('read');
    expect(delivery(101)).toBe('sent');
  });
});
