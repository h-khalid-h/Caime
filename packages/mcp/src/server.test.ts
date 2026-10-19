import { Caime } from '@caime/sdk';
import { describe, expect, it } from 'vitest';
import { createServer, PROTOCOL_VERSIONS } from './server';
import { checkArguments, TOOLS } from './tools';

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A Caime that answers each route as the real one does, remembering what was asked. */
function caime(answer: (s: Seen) => Response) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const s: Seen = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    seen.push(s);
    return answer(s);
  }) as typeof fetch;
  const client = new Caime({ token: 'cap_test', baseUrl: 'https://caime.test', fetch: fetchImpl });
  return { seen, server: createServer({ client, version: '0.1.0' }) };
}

const ask = (method: string, params?: unknown, id: number | string = 1) => ({
  jsonrpc: '2.0' as const,
  id,
  method,
  ...(params === undefined ? {} : { params }),
});
/** A response's result, or a failure of the test when there is none. */
function result<T>(r: { result?: unknown } | null): T {
  if (!r || r.result === undefined) throw new Error(`no result: ${JSON.stringify(r)}`);
  return r.result as T;
}
const text = (r: { result?: unknown } | null) =>
  result<{ content: Array<{ text: string }>; isError?: boolean }>(r).content[0]?.text ?? '';

const TASK = {
  id: 'a1',
  title: 'Send the deck',
  notes: null,
  status: 'open',
  direction: 'mine',
  shared: false,
  owner: { id: 'u1', displayName: 'Noor' },
  assignee: { id: null, displayName: 'Noor' },
  dueAt: '2026-10-12T09:00:00.000Z',
  dueHasTime: true,
  remindAt: null,
  caiFollowUp: false,
  conversationId: null,
  messageId: null,
  source: null,
  contextId: null,
  relationship: null,
  origin: 'manual',
  createdAt: '2026-10-11T10:00:00.000Z',
  completedAt: null,
};

describe('the handshake', () => {
  it('answers initialize with the client’s version when it speaks one of ours, else the newest', async () => {
    const { server } = caime(() => json(404, {}));
    const r = await server.handle(ask('initialize', { protocolVersion: '2025-03-26' }));
    expect(r?.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'caime', version: '0.1.0' },
    });
    expect(result<{ instructions: string }>(r).instructions).toMatch(/personal token/);
    const newer = await server.handle(ask('initialize', { protocolVersion: '2099-01-01' }));
    expect(result<{ protocolVersion: string }>(newer).protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect((await server.handle(ask('ping')))?.result).toEqual({});
  });

  it('lists the tools with their schemas, every one naming the permission it needs', async () => {
    const { server } = caime(() => json(404, {}));
    const r = await server.handle(ask('tools/list'));
    const tools = result<{
      tools: Array<{ name: string; description: string; inputSchema: object }>;
    }>(r).tools;
    expect(tools.map((t) => t.name)).toEqual([
      'me',
      'inbox',
      'feed',
      'search',
      'tasks',
      'add_task',
      'update_task',
      'conversation',
      'messages',
      'send_message',
    ]);
    for (const t of tools) {
      expect(t.description).toMatch(/Needs (profile|messages|actions):(read|write)\./);
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
    expect(TOOLS.length).toBe(tools.length);
  });

  it('refuses what isn’t a request, a method it lacks and bad JSON, in JSON-RPC’s words', async () => {
    const { server } = caime(() => json(404, {}));
    expect((await server.handle({ hello: 1 }))?.error?.code).toBe(-32600);
    expect((await server.handle(ask('resources/list')))?.error).toEqual({
      code: -32601,
      message: 'no method resources/list',
    });
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/cancelled' })).toBeNull();
    expect((await server.handleText('{not json'))?.error?.code).toBe(-32700);
    const ok = await server.handleText(JSON.stringify(ask('ping', undefined, 'p')));
    expect(ok).toEqual({ jsonrpc: '2.0', id: 'p', result: {} });
  });
});

describe('the tools', () => {
  it('call Caime as the token, and give a bounded projection back', async () => {
    const { seen, server } = caime((s) => {
      if (s.url.endsWith('/v1/me'))
        return json(200, {
          user: {
            id: 'u1',
            handle: 'noor',
            displayName: 'Noor',
            avatarUrl: null,
            timeZone: 'Asia/Dubai',
            locale: 'en',
          },
        });
      if (s.url.endsWith('/v1/tasks?view=waiting'))
        return json(200, {
          tasks: [TASK],
          counts: { todo: 1, waiting: 1, asked_me: 0, overdue: 0 },
        });
      if (s.url.endsWith('/v1/inbox'))
        return json(200, {
          headline: 'One needs you',
          counts: { needs_you: 1 },
          sections: [
            {
              section: 'needs_you',
              label: 'Needs you',
              items: [
                {
                  id: 'c1',
                  kind: 'direct',
                  title: 'Omar',
                  space: null,
                  topic: null,
                  isGeneral: true,
                  parentId: null,
                  privacyClass: 'standard',
                  other: {
                    id: 'u2',
                    handle: 'omar',
                    displayName: 'Omar',
                    kind: 'human',
                    avatarUrl: null,
                    bio: null,
                    pronouns: null,
                  },
                  org: null,
                  relationship: { label: 'Friend', sphere: 'personal' },
                  memberCount: 2,
                  lastMessage: {
                    id: 'm1',
                    seq: 4,
                    senderId: 'u2',
                    kind: 'text',
                    preview: 'Can you send the deck?',
                    mine: false,
                    createdAt: '2026-10-11T09:00:00.000Z',
                  },
                  unreadCount: 1,
                },
              ],
            },
          ],
        });
      return json(404, { error: { code: 'not_found', message: 'No.' } });
    });
    const me = await server.handle(ask('tools/call', { name: 'me' }));
    expect(JSON.parse(text(me))).toMatchObject({ handle: 'noor', timeZone: 'Asia/Dubai' });
    expect(seen[0]?.headers.authorization).toBe('Bearer cap_test');
    const tasks = await server.handle(
      ask('tools/call', { name: 'tasks', arguments: { view: 'waiting' } }),
    );
    expect(JSON.parse(text(tasks))).toEqual({
      counts: { todo: 1, waiting: 1, asked_me: 0, overdue: 0 },
      tasks: [
        {
          id: 'a1',
          title: 'Send the deck',
          notes: null,
          status: 'open',
          direction: 'mine',
          owner: 'Noor',
          assignee: 'Noor',
          dueAt: '2026-10-12T09:00:00.000Z',
          dueHasTime: true,
          remindAt: null,
          caiFollowUp: false,
          conversationId: null,
          createdAt: '2026-10-11T10:00:00.000Z',
          completedAt: null,
        },
      ],
    });
    const inbox = JSON.parse(text(await server.handle(ask('tools/call', { name: 'inbox' }))));
    expect(inbox.sections[0].conversations[0]).toEqual({
      id: 'c1',
      kind: 'direct',
      title: 'Omar',
      topic: null,
      with: { id: 'u2', handle: 'omar', name: 'Omar' },
      org: null,
      relationship: 'Friend',
      members: 2,
      last: { preview: 'Can you send the deck?', mine: false, at: '2026-10-11T09:00:00.000Z' },
    });
    // Nothing of the view the agent didn't need (an avatar, a privacy class) travels.
    expect(JSON.stringify(inbox)).not.toMatch(/avatarUrl|privacyClass|unreadCount/);
  });

  it('reads what reached the person, and carries on from where it left off', async () => {
    const NEXT = 'n'.repeat(40);
    const { seen, server } = caime((s) =>
      s.url.includes('/v1/feed')
        ? json(200, {
            events: [
              {
                id: 'm7',
                event: 'message.created',
                createdAt: '2026-10-19T09:00:00.000Z',
                data: {
                  conversation: { id: 'c1', kind: 'direct', title: 'Omar', topic: null },
                  from: { id: 'u2', name: 'Omar', handle: 'omar' },
                  text: 'Can you send the deck?',
                  card: null,
                  message: {
                    id: 'm7',
                    kind: 'text',
                    files: [],
                    payload: {},
                    reactions: [],
                    body: 'Can you send the deck?',
                  },
                },
              },
            ],
            next: NEXT,
          })
        : json(404, { error: { code: 'not_found', message: 'No.' } }),
    );
    const first = JSON.parse(text(await server.handle(ask('tools/call', { name: 'feed' }))));
    expect(first).toEqual({
      events: [
        {
          id: 'm7',
          at: '2026-10-19T09:00:00.000Z',
          conversation: { id: 'c1', title: 'Omar', topic: null },
          from: { id: 'u2', name: 'Omar' },
          text: 'Can you send the deck?',
          kind: 'text',
          files: 0,
        },
      ],
      next: NEXT,
    });
    // Nothing of the message's view beyond the projection (its payload, its reactions) travels.
    expect(JSON.stringify(first)).not.toMatch(/payload|reactions|handle/);
    await server.handle(
      ask('tools/call', { name: 'feed', arguments: { after: NEXT, limit: 10, mine: true } }),
    );
    expect(seen.at(-1)?.url).toBe(`https://caime.test/v1/feed?after=${NEXT}&limit=10&mine=1`);
  });

  it('writes with the arguments as given, and a sealed message’s words never leave the device', async () => {
    const { seen, server } = caime((s) => {
      if (s.method === 'POST' && s.url.endsWith('/v1/tasks')) return json(201, { task: TASK });
      if (s.method === 'PATCH') return json(200, { task: { ...TASK, status: 'done' } });
      if (s.method === 'POST' && s.url.includes('/messages'))
        return json(201, {
          message: {
            id: 'm9',
            conversationId: 'c1',
            seq: 5,
            clientId: 'agent-00000001',
            senderId: 'u1',
            automated: false,
            aiAgent: false,
            kind: 'text',
            body: 'On it.',
            payload: {},
            mode: 'plain',
            entities: {},
            mentions: [],
            replyTo: null,
            forwarded: false,
            urgent: false,
            isQuestion: false,
            isRequest: false,
            reactions: [],
            files: [],
            poll: null,
            album: null,
            sentVia: null,
            channel: null,
            mail: null,
            sealed: null,
            pinnedAt: null,
            editedAt: null,
            deletedAt: null,
            createdAt: '2026-10-11T10:01:00.000Z',
          },
        });
      if (s.url.includes('/messages?'))
        return json(200, {
          lastSeq: 2,
          hasMore: false,
          messages: [
            {
              id: 'm1',
              conversationId: 'c2',
              seq: 1,
              senderId: 'u2',
              kind: 'text',
              body: null,
              sealed: { v: 1 },
              replyTo: null,
              files: [],
              editedAt: null,
              deletedAt: null,
              createdAt: '2026-10-11T08:00:00.000Z',
            },
          ],
        });
      return json(404, { error: { code: 'not_found', message: 'No.' } });
    });
    const added = await server.handle(
      ask('tools/call', {
        name: 'add_task',
        arguments: {
          title: 'Send the deck',
          dueAt: '2026-10-12T09:00:00Z',
          dueHasTime: true,
          clientId: 'agent-00000001',
        },
      }),
    );
    expect(JSON.parse(text(added)).id).toBe('a1');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      title: 'Send the deck',
      dueAt: '2026-10-12T09:00:00Z',
      dueHasTime: true,
      clientId: 'agent-00000001',
    });
    const done = await server.handle(
      ask('tools/call', {
        name: 'update_task',
        arguments: { taskId: '0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', status: 'done' },
      }),
    );
    expect(JSON.parse(text(done)).status).toBe('done');
    expect(seen[1]?.url).toMatch(/\/v1\/tasks\/0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b$/);
    expect(seen[1]?.body).toBe('{"status":"done"}');
    const sent = await server.handle(
      ask('tools/call', {
        name: 'send_message',
        arguments: {
          conversationId: '0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
          body: 'On it.',
          clientId: 'agent-00000001',
        },
      }),
    );
    expect(JSON.parse(text(sent))).toMatchObject({
      id: 'm9',
      seq: 5,
      body: 'On it.',
      private: false,
    });
    expect(JSON.parse(seen[2]?.body ?? '{}')).toEqual({
      clientId: 'agent-00000001',
      body: 'On it.',
    });
    const page = await server.handle(
      ask('tools/call', {
        name: 'messages',
        arguments: { conversationId: '0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', limit: 20 },
      }),
    );
    expect(JSON.parse(text(page))).toEqual({
      lastSeq: 2,
      hasMore: false,
      messages: [
        {
          id: 'm1',
          seq: 1,
          from: 'u2',
          kind: 'text',
          body: null,
          private: true,
          at: '2026-10-11T08:00:00.000Z',
          replyTo: null,
          files: 0,
        },
      ],
    });
    expect(seen[3]?.url).toMatch(/\/messages\?limit=20$/);
  });

  it('checks arguments before calling, and gives a refusal back as the server said it', async () => {
    const { seen, server } = caime(() =>
      json(403, { error: { code: 'token_scope', message: 'This token can’t write messages.' } }),
    );
    const missing = await server.handle(ask('tools/call', { name: 'search' }));
    expect(missing?.error).toEqual({ code: -32602, message: 'arguments.q is required' });
    const stray = await server.handle(
      ask('tools/call', { name: 'tasks', arguments: { view: 'later' } }),
    );
    expect(stray?.error?.message).toBe(
      'arguments.view must be one of todo, waiting, asked_me, i_asked, done, all',
    );
    const extra = await server.handle(
      ask('tools/call', { name: 'me', arguments: { handle: 'x' } }),
    );
    expect(extra?.error?.message).toBe('arguments.handle is not a field of this tool');
    const nobody = await server.handle(ask('tools/call', { name: 'delete_everything' }));
    expect(nobody?.error?.message).toBe('no tool named delete_everything');
    expect(seen).toHaveLength(0);
    const refused = await server.handle(
      ask('tools/call', {
        name: 'send_message',
        arguments: { conversationId: '0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', body: 'hi' },
      }),
    );
    expect(refused?.result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'token_scope: This token can’t write messages.' }],
    });
  });

  it('the argument check reads the schema’s few shapes', () => {
    const schema = TOOLS.find((t) => t.name === 'messages')?.inputSchema;
    if (!schema) throw new Error('messages tool');
    const cid = '0f3b8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(checkArguments(schema, { conversationId: cid })).toBeNull();
    expect(checkArguments(schema, { conversationId: cid, limit: 0 })).toBe(
      'arguments.limit must be at least 1',
    );
    expect(checkArguments(schema, { conversationId: cid, limit: 1.5 })).toBe(
      'arguments.limit must be an integer',
    );
    expect(checkArguments(schema, { conversationId: 'short' })).toBe(
      'arguments.conversationId must be at least 36 characters',
    );
    expect(checkArguments(schema, [])).toBe('arguments must be an object');
    expect(checkArguments(schema, { conversationId: null })).toBe(
      'arguments.conversationId is required',
    );
    const task = TOOLS.find((t) => t.name === 'update_task')?.inputSchema;
    if (!task) throw new Error('update_task tool');
    expect(checkArguments(task, { taskId: cid, notes: null, dueAt: null })).toBeNull();
    expect(checkArguments(task, { taskId: cid, caiFollowUp: 'yes' })).toBe(
      'arguments.caiFollowUp must be true or false',
    );
  });
});
