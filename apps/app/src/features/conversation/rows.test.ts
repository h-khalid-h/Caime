import type { MessageView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { buildRows, importedAuthor, messageInfo, namesIn } from './rows';

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

describe('replies and who has a message (M16 E2)', () => {
  const person = (id: string, displayName: string, kind = 'human') => ({ id, displayName, kind });
  const group = (participants: unknown[]) =>
    ({ kind: 'group', business: null, participants }) as never;
  const mine = { id: 'm5', seq: 5, senderId: ME, kind: 'text' } as unknown as MessageView;

  it('says who read, who has it and who doesn’t yet, by name', () => {
    const info = messageInfo(
      mine,
      group([
        { userId: ME, person: person(ME, 'Me'), readSeq: 5, deliveredSeq: 5 },
        { userId: 'a', person: person('a', 'Sarah'), readSeq: 5, deliveredSeq: 5 },
        // Reading withheld: arrived is all that's said.
        { userId: 'b', person: person('b', 'Ahmed'), readSeq: null, deliveredSeq: 7 },
        { userId: 'c', person: person('c', 'Lina'), readSeq: 3, deliveredSeq: 4 },
        {
          userId: 'd',
          person: person('d', 'mail@example.com', 'provisional'),
          readSeq: 0,
          deliveredSeq: 0,
        },
      ]),
      ME,
    );
    expect(info).toEqual({ read: ['Sarah'], delivered: ['Ahmed'], waiting: ['Lina'] });
  });

  it('says nothing of someone else’s message, a chat, a crowd or one still on the device', () => {
    const people = [{ userId: ME, person: person(ME, 'Me'), readSeq: 5, deliveredSeq: 5 }];
    expect(messageInfo({ ...mine, senderId: 'a' }, group(people), ME)).toBeNull();
    expect(
      messageInfo(mine, { kind: 'direct', business: null, participants: people } as never, ME),
    ).toBeNull();
    expect(messageInfo({ ...mine, seq: Number.MAX_SAFE_INTEGER }, group(people), ME)).toBeNull();
    const crowd = Array.from({ length: 101 }, (_, i) => ({
      userId: i ? `p${i}` : ME,
      person: person(i ? `p${i}` : ME, `P${i}`),
      readSeq: 9,
      deliveredSeq: 9,
    }));
    expect(messageInfo(mine, group(crowd), ME)).toBeNull();
  });

  it('names a quoted message’s writer: “You” for one’s own, the organization to its customer', () => {
    const org = { id: 'org-1', name: 'Nile Dental' };
    const conversation = {
      kind: 'business',
      business: { org, thread: null, readSeq: null, deliveredSeq: 0 },
      participants: [{ userId: ME, person: person(ME, 'Me'), readSeq: 1, deliveredSeq: 1 }],
    } as never;
    expect(namesIn(conversation).get('org-1')).toBe('Nile Dental');
    const reply = (senderId: string) =>
      ({
        ...line(2, '2024-05-01T18:01:00.000Z', {}),
        senderId: 'org-1',
        replyTo: { id: 'q', seq: 1, senderId, preview: 'When?', kind: 'text' },
      }) as unknown as MessageView;
    const names = [reply(ME), reply('org-1')].map(
      (m) =>
        buildRows({
          messages: [m],
          pending: [],
          conversation,
          me: ME,
          unreadFrom: null,
          now: new Date('2024-05-02T09:00:00.000Z'),
          timeZone: 'UTC',
          locale: 'en-GB',
        }).flatMap((r) => (r.type === 'message' ? [r.replyName] : []))[0],
    );
    expect(names).toEqual(['You', 'Nile Dental']);
  });
});
