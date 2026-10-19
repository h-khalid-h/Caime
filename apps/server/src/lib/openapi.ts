/**
 * The API as a document (R79, R78): OpenAPI 3.1 for every route a token reaches, an app's
 * (`API_ROUTES`) and a person's (`PERSON_ROUTES`), written from the very zod schemas the routes
 * parse their query and body with, so a platform (Zapier, Make, n8n, Pipedream, an agent
 * framework) imports Caime rather than hand-writing it, and the document can't drift from the
 * routes. Responses are the contract's own shapes (`packages/core/src/api.ts`), named here and
 * described in `docs/API.md`; the document is built once per process.
 */
import {
  AssignThreadBody,
  BusinessInboxQuery,
  CalendarWindowQuery,
  CreateTaskBody,
  DeliveriesQuery,
  EditUpdateBody,
  ERROR_CODES,
  EscalateThreadBody,
  FeedQuery,
  InboxQuery,
  KitFieldsBody,
  KitMoveBody,
  MessagesPageQuery,
  PostUpdateBody,
  RetimeBody,
  SearchQuery,
  SendMessageBody,
  TasksQuery,
  UpdatesPageQuery,
  UpdateTaskBody,
} from '@caime/core';
import type { OpenApiDocument, OpenApiOperation } from '@caime/core/api';
import { z } from 'zod';
import { PERSON_ROUTES } from './access';
import { API_ROUTES } from './apps';

interface RouteDoc {
  id: string;
  summary: string;
  description?: string;
  query?: z.ZodType;
  body?: z.ZodType;
  /** The contract's name for the answer, or `bytes` for a file. */
  response: string;
}

/** Each route a token reaches, by its key in `API_ROUTES` and `PERSON_ROUTES`. */
const DOCS: Record<string, RouteDoc> = {
  'GET /v1/apps/me': {
    id: 'me',
    summary: 'Who this token is: the app, its organization, its bot and its permissions.',
    response: 'AppMeView',
  },
  'GET /v1/apps/me/deliveries': {
    id: 'deliveries',
    summary: 'The app’s webhook deliveries, newest first, or the ones since one it handled.',
    query: DeliveriesQuery,
    response: 'DeliveriesResponse',
  },
  'POST /v1/apps/me/deliveries/:id/retry': {
    id: 'retryDelivery',
    summary: 'A failed delivery queued afresh, with the whole schedule again.',
    response: 'DeliveryResponse',
  },
  'GET /v1/orgs/:id/inbox': {
    id: 'inbox',
    summary: 'The organization’s Business inbox, by view.',
    query: BusinessInboxQuery,
    response: 'BusinessInboxView',
  },
  'GET /v1/orgs/:id/calendar': {
    id: 'calendar',
    summary: 'The organization’s bookings in a window of up to a year.',
    query: CalendarWindowQuery,
    response: 'OrgCalendarView',
  },
  'GET /v1/orgs/:id/orders': {
    id: 'orders',
    summary: 'The orders in its customer conversations, newest first.',
    response: 'OrgOrdersView',
  },
  'GET /v1/conversations/:id': {
    id: 'conversation',
    summary: 'One conversation, with its thread where it has one.',
    response: 'ConversationResponse',
  },
  'GET /v1/conversations/:id/messages': {
    id: 'messages',
    summary: 'Its messages, oldest first, a page at a time by sequence number.',
    query: MessagesPageQuery,
    response: 'MessagesPage',
  },
  'GET /v1/files/:id': {
    id: 'file',
    summary: 'A file a message carries, as its bytes.',
    response: 'bytes',
  },
  'GET /v1/files/:id/thumb': {
    id: 'thumbnail',
    summary: 'Its thumbnail where it is an image (WebP, 480 px at most).',
    response: 'bytes',
  },
  'GET /v1/files/:id/preview': {
    id: 'preview',
    summary: 'Its preview where it is an image (1280 px at most, else the cleaned original).',
    response: 'bytes',
  },
  'POST /v1/conversations/:id/messages': {
    id: 'send',
    summary: 'Send a message: as the bot for an app, as the person for a personal token.',
    description:
      'A retried clientId returns the first message, never a second. An app with the kits permission sends its own card with kind "kit".',
    body: SendMessageBody,
    response: 'MessageResponse',
  },
  'POST /v1/business/:conversationId/assign': {
    id: 'assign',
    summary: 'Give the conversation to someone on the team, or to nobody.',
    body: AssignThreadBody,
    response: 'ThreadResponse',
  },
  'POST /v1/business/:conversationId/resolve': {
    id: 'resolve',
    summary: 'Mark it resolved.',
    response: 'ThreadResponse',
  },
  'POST /v1/business/:conversationId/reopen': {
    id: 'reopen',
    summary: 'Open it again.',
    response: 'ThreadResponse',
  },
  'POST /v1/business/:conversationId/escalate': {
    id: 'escalate',
    summary: 'Escalate it to the organization’s owner and admins, with a note.',
    body: EscalateThreadBody,
    response: 'ThreadResponse',
  },
  'DELETE /v1/business/:conversationId/escalation': {
    id: 'stopEscalating',
    summary: 'Stop escalating it.',
    response: 'ThreadResponse',
  },
  'GET /v1/orgs/:id/updates': {
    id: 'updates',
    summary: 'The organization’s updates, newest first, with how many follow, never who.',
    query: UpdatesPageQuery,
    response: 'OrgUpdatesView',
  },
  'POST /v1/orgs/:id/updates': {
    id: 'postUpdate',
    summary: 'Post an update to everyone who follows the organization.',
    body: PostUpdateBody,
    response: 'OrgUpdateResponse',
  },
  'PATCH /v1/orgs/:id/updates/:updateId': {
    id: 'editUpdate',
    summary: 'Change an update; followers’ notifications change with it.',
    body: EditUpdateBody,
    response: 'OrgUpdateResponse',
  },
  'DELETE /v1/orgs/:id/updates/:updateId': {
    id: 'removeUpdate',
    summary: 'Take an update back.',
    response: 'OkResponse',
  },
  'GET /v1/kits': {
    id: 'kits',
    summary: 'The app’s own kinds of card.',
    response: 'AppKitsResponse',
  },
  'PUT /v1/kits/:key': {
    id: 'putKit',
    summary: 'Define or change one of the app’s kinds of card.',
    description:
      'The body is a kit definition as docs/API.md describes it (fields, states, moves).',
    body: z.record(z.string(), z.unknown()),
    response: 'AppKitResponse',
  },
  'DELETE /v1/kits/:key': {
    id: 'removeKit',
    summary: 'Remove one of the app’s kinds of card.',
    response: 'OkResponse',
  },
  'POST /v1/messages/:id/kit': {
    id: 'moveCard',
    summary: 'Move one of its cards on to a state.',
    body: KitMoveBody,
    response: 'MessageResponse',
  },
  'PATCH /v1/messages/:id/kit': {
    id: 'changeCard',
    summary: 'Change what one of its cards says.',
    body: KitFieldsBody,
    response: 'MessageResponse',
  },
  'POST /v1/messages/:id/time': {
    id: 'suggestTime',
    summary:
      'Give a meeting or an appointment another time, which asks the other side again (a booking from the catalog, an open time of what it booked).',
    body: RetimeBody,
    response: 'MessageResponse',
  },
  'GET /v1/me': {
    id: 'person',
    summary: 'Who a personal token acts for: id, handle, name, avatar, time zone and locale.',
    response: 'GrantUserView',
  },
  'GET /v1/inbox': {
    id: 'myInbox',
    summary: 'The person’s inbox, in its sections or as one list.',
    query: InboxQuery,
    response: 'InboxResponse',
  },
  'GET /v1/feed': {
    id: 'feed',
    summary: 'What reached the person: new messages in their conversations.',
    description:
      'Without after, the newest first (a poller dedupes by id); with the next a read gave, only what came since, oldest first. Gap-free: a message still being written is held back, never skipped. Their own messages only with mine=1.',
    query: FeedQuery,
    response: 'FeedResponse',
  },
  'GET /v1/search': {
    id: 'search',
    summary: 'Search as the person would type it.',
    description:
      'The rules read it; with understand=1 a model may, when the person has AI assist on. A time at the end ("last week", "in March") is the days to search, never a person.',
    query: SearchQuery,
    response: 'SearchResponse',
  },
  'GET /v1/tasks': {
    id: 'tasks',
    summary: 'The person’s actions and what they wait for, by list.',
    query: TasksQuery,
    response: 'TasksResponse',
  },
  'POST /v1/tasks': {
    id: 'addTask',
    summary: 'Add an action; the same clientId again returns the same one.',
    body: CreateTaskBody,
    response: 'TaskResponse',
  },
  'PATCH /v1/tasks/:id': {
    id: 'updateTask',
    summary: 'Change or finish an action.',
    body: UpdateTaskBody,
    response: 'TaskResponse',
  },
};

const ErrorResponse = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});

const PATH_PARAM = /:([A-Za-z]+)/g;

/** `:id` as OpenAPI writes it, and the parameters it names (a uuid, but a kit's key). */
function openApiPath(route: string): { path: string; params: OpenApiOperation['parameters'] } {
  const params: OpenApiOperation['parameters'] = [];
  const path = route.replace(PATH_PARAM, (_, name: string) => {
    params.push({
      name,
      in: 'path',
      required: true,
      schema:
        name === 'key' ? { type: 'string', maxLength: 40 } : { type: 'string', format: 'uuid' },
    });
    return `{${name}}`;
  });
  return { path, params };
}

/** A zod schema as JSON Schema, as the route reads it (coercions and defaults as input). */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

function queryParameters(schema: z.ZodType): OpenApiOperation['parameters'] {
  const json = jsonSchema(schema);
  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((json.required ?? []) as string[]);
  return Object.entries(properties).map(([name, prop]) => {
    const { description, ...rest } = prop;
    return {
      name,
      in: 'query' as const,
      required: required.has(name),
      schema: rest,
      ...(typeof description === 'string' ? { description } : {}),
    };
  });
}

function build(publicUrl: string): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  const schemas: Record<string, unknown> = { ErrorResponse: jsonSchema(ErrorResponse) };
  const routes = new Set([...Object.keys(API_ROUTES), ...Object.keys(PERSON_ROUTES)]);
  for (const route of routes) {
    const doc = DOCS[route];
    if (!doc) throw new Error(`openapi: ${route} is reachable by a token but undocumented`);
    const [method, rawPath] = route.split(' ') as [string, string];
    const { path, params } = openApiPath(rawPath);
    const security: OpenApiOperation['security'] = [];
    const appScope = API_ROUTES[route];
    const personScope = PERSON_ROUTES[route];
    if (appScope) security.push({ appToken: appScope === 'any' ? [] : [appScope] });
    if (personScope) security.push({ personalToken: [personScope] });
    if (doc.response !== 'bytes' && !schemas[doc.response])
      schemas[doc.response] = {
        type: 'object',
        description: `${doc.response} in packages/core/src/api.ts: the JSON the Caime apps read, as docs/API.md describes it.`,
      };
    const operation: OpenApiOperation = {
      operationId: doc.id,
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      tags: [appScope ? (personScope ? 'Apps and people' : 'Apps') : 'People'],
      security,
      parameters: [...params, ...(doc.query ? queryParameters(doc.query) : [])],
      ...(doc.body
        ? {
            requestBody: {
              required: true as const,
              content: { 'application/json': { schema: jsonSchema(doc.body) } },
            },
          }
        : {}),
      responses: {
        [method === 'POST' && ['send', 'addTask', 'postUpdate'].includes(doc.id) ? '201' : '200']:
          doc.response === 'bytes'
            ? {
                description: 'The file’s bytes, with its own content type.',
                content: { '*/*': { schema: { type: 'string', format: 'binary' } } },
              }
            : {
                description: doc.response,
                content: {
                  'application/json': { schema: { $ref: `#/components/schemas/${doc.response}` } },
                },
              },
        '4XX': {
          description:
            'A refusal: 401 for a token that is unknown, revoked or expired, 403 token_route or token_scope for a route or permission the token lacks, 404 for what it may not see, 429 past 600 requests a minute.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
      },
    };
    paths[path] = { ...(paths[path] ?? {}), [method.toLowerCase()]: operation };
  }
  const base = publicUrl.replace(/\/+$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Caime API',
      version: '1',
      description:
        'The routes an app’s token (cai_…, made on an organization’s setup screen) and a person’s token (cap_…, made under Developer or for a bridge such as Zapier; cao_… for an app let in through OAuth) reach. Send the token as a bearer. Everything is described in docs/API.md; the responses are the same JSON the Caime apps read.',
    },
    servers: [{ url: base }],
    paths,
    components: {
      securitySchemes: {
        appToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An organization app’s token (cai_…): its scopes are inbox:read, messages:read, messages:write, threads:write, updates and kits.',
        },
        personalToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A person’s token (cap_…) or an OAuth access token (cao_…): its scopes are profile:read, messages:read, messages:write, actions:read and actions:write.',
        },
      },
      schemas,
    },
  };
}

let built: { url: string; document: OpenApiDocument } | null = null;

/** The document for this deployment, built once. */
export function openApiDocument(publicUrl: string): OpenApiDocument {
  if (!built || built.url !== publicUrl) built = { url: publicUrl, document: build(publicUrl) };
  return built.document;
}
