/**
 * The tools, one per person method of the SDK, each with a JSON Schema for its arguments and
 * a bounded, plain projection of the answer: an agent pays for every token it reads, so a
 * conversation is its people and its lines, never every field of a view. The permission each
 * needs is in its description, so an agent whose token lacks it learns why from the refusal.
 */
import type {
  ConversationView,
  FeedEventView,
  InboxItemView,
  InboxResponse,
  MessageView,
  SearchResponse,
  TaskView,
} from '@caime/core/api';
import type { Caime, NewTask, TaskChange, TaskListView } from '@caime/sdk';

/** The part of JSON Schema the tools use; `checkArguments` holds every call to it. */
export interface Schema {
  type: 'object' | 'string' | 'integer' | 'boolean';
  description?: string;
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: false;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Schema;
  run: (client: Caime, args: Record<string, unknown>) => Promise<unknown>;
}

const TASK_VIEWS: readonly TaskListView[] = [
  'todo',
  'waiting',
  'asked_me',
  'i_asked',
  'done',
  'all',
];

const object = (properties: Record<string, Schema>, required: readonly string[] = []): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string, more: Partial<Schema> = {}): Schema => ({
  type: 'string',
  description,
  ...more,
});
const id = (what: string) => str(`The ${what}'s id (a UUID).`, { minLength: 36, maxLength: 36 });
const when = (what: string) =>
  str(`${what}, as ISO 8601 ("2026-10-12T09:00:00Z"), or null to clear it.`);

// --- Projections --------------------------------------------------------------------------

const conversationLine = (c: InboxItemView) => ({
  id: c.id,
  kind: c.kind,
  title: c.title,
  topic: c.topic,
  with: c.other ? { id: c.other.id, handle: c.other.handle, name: c.other.displayName } : null,
  org: c.org ? { id: c.org.id, name: c.org.name, handle: c.org.handle } : null,
  relationship: c.relationship?.label ?? null,
  members: c.memberCount,
  last: c.lastMessage
    ? { preview: c.lastMessage.preview, mine: c.lastMessage.mine, at: c.lastMessage.createdAt }
    : null,
});

const inboxView = (inbox: InboxResponse) => ({
  headline: inbox.headline,
  counts: inbox.counts,
  sections: inbox.sections.map((s) => ({
    section: s.section,
    label: s.label,
    conversations: s.items.map(conversationLine),
  })),
});

/** One thing that reached the person: where, from whom, what it says, as a recipe reads it. */
const eventLine = (e: FeedEventView) => ({
  id: e.id,
  at: e.createdAt,
  conversation: {
    id: e.data.conversation.id,
    title: e.data.conversation.title,
    topic: e.data.conversation.topic,
  },
  from: e.data.from ? { id: e.data.from.id, name: e.data.from.name } : null,
  text: e.data.text,
  kind: e.data.message.kind,
  ...(e.data.card ? { card: e.data.card } : {}),
  files: e.data.message.files.length,
});

const messageLine = (m: MessageView) => ({
  id: m.id,
  seq: m.seq,
  from: m.senderId,
  kind: m.kind,
  body: m.sealed ? null : m.body,
  private: m.sealed !== null,
  at: m.createdAt,
  replyTo: m.replyTo ? { id: m.replyTo.id, seq: m.replyTo.seq } : null,
  files: m.files.length,
  ...(m.editedAt ? { editedAt: m.editedAt } : {}),
  ...(m.deletedAt ? { deleted: true } : {}),
});

const taskLine = (t: TaskView) => ({
  id: t.id,
  title: t.title,
  notes: t.notes,
  status: t.status,
  direction: t.direction,
  owner: t.owner.displayName,
  assignee: t.assignee.displayName,
  dueAt: t.dueAt,
  dueHasTime: t.dueHasTime,
  remindAt: t.remindAt,
  caiFollowUp: t.caiFollowUp,
  conversationId: t.conversationId,
  createdAt: t.createdAt,
  completedAt: t.completedAt,
});

const conversationDetail = (c: ConversationView) => ({
  id: c.id,
  kind: c.kind,
  title: c.title,
  name: c.name,
  topic: c.topic,
  purpose: c.purpose,
  private: c.privacyClass === 'private',
  people: c.participants.map((p) => ({
    id: p.userId,
    handle: p.person.handle,
    name: p.person.displayName,
    role: p.role,
    relationship: p.relationship?.label ?? null,
  })),
  topics: c.topics.map((t) => ({ id: t.id, title: t.title })),
});

const searchView = (r: SearchResponse) => ({
  understoodBy: r.understoodBy,
  interpretation: r.interpretation,
  people: (r.results.people ?? []).map((p) => ({
    id: p.person.id,
    handle: p.person.handle,
    name: p.person.displayName,
    relationship: p.relationship?.label ?? null,
  })),
  organizations: r.results.organizations ?? [],
  messages: (r.results.messages ?? []).map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    conversation: m.conversationTitle,
    from: m.senderName,
    snippet: m.snippet,
    at: m.createdAt,
  })),
  tasks: (r.results.tasks ?? []).map(taskLine),
  decisions: r.results.decisions ?? [],
});

// --- The tools -----------------------------------------------------------------------------

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'me',
    description:
      'Who this token acts for: their handle, name, time zone and locale. Needs profile:read.',
    inputSchema: object({}),
    run: (c) => c.person(),
  },
  {
    name: 'inbox',
    description:
      'The person’s inbox in its sections, what needs them first: each conversation with who it is with, the relationship, and the last line. Needs messages:read.',
    inputSchema: object({}),
    run: async (c) => inboxView(await c.myInbox()),
  },
  {
    name: 'feed',
    description:
      'What reached the person: new messages in their conversations, the newest first. Pass the next it returns as after, and only what came since comes, oldest first, never one passed over. Their own messages only with mine. Needs messages:read.',
    inputSchema: object({
      after: str('The next a previous call returned.', { minLength: 32, maxLength: 512 }),
      limit: {
        type: 'integer',
        description: 'How many, 50 when left out.',
        minimum: 1,
        maximum: 100,
      },
      conversationId: id('conversation'),
      mine: { type: 'boolean', description: 'Include what the person sent too.' },
    }),
    run: async (c, a) => {
      const r = await c.feed({
        ...(typeof a.after === 'string' ? { after: a.after } : {}),
        ...(typeof a.limit === 'number' ? { limit: a.limit } : {}),
        ...(typeof a.conversationId === 'string' ? { conversationId: a.conversationId } : {}),
        ...(a.mine === true ? { mine: true } : {}),
      });
      return { events: r.events.map(eventLine), next: r.next };
    },
  },
  {
    name: 'search',
    description:
      'Search as the person would type it ("photos from Sara last week", "what did Omar promise"): people, organizations, messages, actions and decisions. Needs messages:read.',
    inputSchema: object(
      {
        q: str('What to look for, in any of Caime’s languages.', { minLength: 1, maxLength: 200 }),
        understand: {
          type: 'boolean',
          description:
            'Let Caime’s model read the query when the rules can’t (only with the person’s AI assist on).',
        },
      },
      ['q'],
    ),
    run: async (c, a) =>
      searchView(await c.search(a.q as string, { understand: a.understand === true })),
  },
  {
    name: 'tasks',
    description:
      'The person’s actions by list: todo (theirs to do), waiting (on others), asked_me, i_asked, done, or all. Needs actions:read.',
    inputSchema: object({
      view: str('Which list; todo when left out.', { enum: TASK_VIEWS }),
    }),
    run: async (c, a) => {
      const r = await c.tasks(a.view as TaskListView | undefined);
      return { counts: r.counts, tasks: r.tasks.map(taskLine) };
    },
  },
  {
    name: 'add_task',
    description:
      'Add an action of the person’s own, or ask it of someone (assigneeId with shared true). Send the same clientId again and the same action comes back. Needs actions:write.',
    inputSchema: object(
      {
        title: str('What to do.', { minLength: 1, maxLength: 200 }),
        notes: str('More, if any.', { maxLength: 2000 }),
        dueAt: when('When it is due'),
        dueHasTime: { type: 'boolean', description: 'Whether the time of day in dueAt counts.' },
        remindAt: when('When to remind'),
        assigneeId: id('person it is asked of'),
        shared: {
          type: 'boolean',
          description: 'With an assignee: they see the request (else a private waiting item).',
        },
        conversationId: id('conversation it belongs to'),
        messageId: id('message it came from'),
        clientId: str(
          'Your own id for this request, 8 to 64 characters, so a retry is the same action.',
          { minLength: 8, maxLength: 64 },
        ),
      },
      ['title'],
    ),
    run: async (c, a) => taskLine(await c.addTask(a as unknown as NewTask)),
  },
  {
    name: 'update_task',
    description:
      'Change an action: its words, dates, status (open, done, cancelled; accepted or declined for one asked of the person), or hand a wait to Cai (caiFollowUp). Needs actions:write.',
    inputSchema: object(
      {
        taskId: id('action'),
        title: str('New title.', { minLength: 1, maxLength: 200 }),
        notes: str('New notes, or null to clear.', { maxLength: 2000 }),
        dueAt: when('When it is due'),
        dueHasTime: { type: 'boolean' },
        remindAt: when('When to remind'),
        status: str('The new status.', {
          enum: ['open', 'accepted', 'declined', 'done', 'cancelled'],
        }),
        caiFollowUp: { type: 'boolean', description: 'Hand this wait to Cai, or take it back.' },
      },
      ['taskId'],
    ),
    run: async (c, a) => {
      const { taskId, ...change } = a;
      return taskLine(await c.updateTask(taskId as string, change as TaskChange));
    },
  },
  {
    name: 'conversation',
    description:
      'A conversation the person is in: its people with their roles and relationships, its purpose and topics. Needs messages:read.',
    inputSchema: object({ conversationId: id('conversation') }, ['conversationId']),
    run: async (c, a) => conversationDetail(await c.conversation(a.conversationId as string)),
  },
  {
    name: 'messages',
    description:
      'A conversation’s messages, oldest first, a page at a time (before or after a seq). A private conversation’s words are sealed on the person’s devices and never here. Needs messages:read.',
    inputSchema: object(
      {
        conversationId: id('conversation'),
        before: { type: 'integer', description: 'Only messages before this seq.', minimum: 1 },
        after: { type: 'integer', description: 'Only messages after this seq.', minimum: 0 },
        limit: {
          type: 'integer',
          description: 'How many, 50 when left out.',
          minimum: 1,
          maximum: 200,
        },
      },
      ['conversationId'],
    ),
    run: async (c, a) => {
      const { conversationId, ...page } = a;
      const r = await c.messages(
        conversationId as string,
        page as { before?: number; after?: number; limit?: number },
      );
      return { messages: r.messages.map(messageLine), lastSeq: r.lastSeq, hasMore: r.hasMore };
    },
  },
  {
    name: 'send_message',
    description:
      'Send a text message as the person into a conversation they are in. Send the same clientId again and the first message comes back, never a second. Needs messages:write.',
    inputSchema: object(
      {
        conversationId: id('conversation'),
        body: str('The words to send.', { minLength: 1, maxLength: 8000 }),
        clientId: str('Your own id for this send, so a retry is the same message.', {
          minLength: 8,
          maxLength: 64,
        }),
      },
      ['conversationId', 'body'],
    ),
    run: async (c, a) =>
      messageLine(
        await c.send(a.conversationId as string, a.body as string, {
          ...(typeof a.clientId === 'string' ? { clientId: a.clientId } : {}),
        }),
      ),
  },
];

/** What's wrong with `args` against `schema`, in one line, or null when nothing is. */
export function checkArguments(schema: Schema, args: unknown, path = 'arguments'): string | null {
  switch (schema.type) {
    case 'object': {
      if (args === null || typeof args !== 'object' || Array.isArray(args))
        return `${path} must be an object`;
      const given = args as Record<string, unknown>;
      for (const key of schema.required ?? [])
        if (given[key] === undefined) return `${path}.${key} is required`;
      for (const [key, value] of Object.entries(given)) {
        const inner = schema.properties?.[key];
        if (!inner) return `${path}.${key} is not a field of this tool`;
        if (value === null) {
          // Null clears a date or notes; a required field is never null.
          if (schema.required?.includes(key)) return `${path}.${key} is required`;
          continue;
        }
        const problem = checkArguments(inner, value, `${path}.${key}`);
        if (problem) return problem;
      }
      return null;
    }
    case 'string': {
      if (typeof args !== 'string') return `${path} must be a string`;
      if (schema.enum && !schema.enum.includes(args))
        return `${path} must be one of ${schema.enum.join(', ')}`;
      if (schema.minLength !== undefined && args.length < schema.minLength)
        return `${path} must be at least ${schema.minLength} characters`;
      if (schema.maxLength !== undefined && args.length > schema.maxLength)
        return `${path} must be at most ${schema.maxLength} characters`;
      return null;
    }
    case 'integer': {
      if (typeof args !== 'number' || !Number.isInteger(args)) return `${path} must be an integer`;
      if (schema.minimum !== undefined && args < schema.minimum)
        return `${path} must be at least ${schema.minimum}`;
      if (schema.maximum !== undefined && args > schema.maximum)
        return `${path} must be at most ${schema.maximum}`;
      return null;
    }
    case 'boolean':
      return typeof args === 'boolean' ? null : `${path} must be true or false`;
  }
}
