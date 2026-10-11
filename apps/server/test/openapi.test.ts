import { PERSONAL_SCOPES } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERSON_ROUTES } from '../src/lib/access';
import { API_ROUTES } from '../src/lib/apps';
import { createTestApp, signup, type TestApp } from './helpers';

/**
 * The API as a document (R79, R78): every route a token reaches, written from the schemas the
 * routes parse with, served to anyone, so a platform or an agent framework imports Caime.
 */
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_URL: 'https://caime.test/' });
});
afterAll(async () => {
  await t.close();
});

type Operation = {
  operationId: string;
  security: Array<Record<string, string[]>>;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    schema: Record<string, unknown>;
  }>;
  requestBody?: { content: { 'application/json': { schema: Record<string, unknown> } } };
  responses: Record<string, { content?: Record<string, unknown> }>;
};

describe('GET /v1/openapi.json', () => {
  it('is public, cached, and names every token-reachable route with its permission', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=600');
    const doc = res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: 'https://caime.test' }]);
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual([
      'appToken',
      'personalToken',
    ]);
    const find = (route: string): Operation => {
      const [method, path] = route.split(' ') as [string, string];
      const op = doc.paths[path.replace(/:(\w+)/g, '{$1}')]?.[method.toLowerCase()];
      expect(op, route).toBeTruthy();
      return op;
    };
    for (const [route, scope] of Object.entries(API_ROUTES))
      expect(find(route).security, route).toContainEqual({
        appToken: scope === 'any' ? [] : [scope],
      });
    for (const [route, scope] of Object.entries(PERSON_ROUTES))
      expect(find(route).security, route).toContainEqual({ personalToken: [scope] });
    // A route both reach says both; one only an app reaches says the app alone.
    expect(find('GET /v1/conversations/:id').security).toHaveLength(2);
    expect(find('GET /v1/orgs/:id/inbox').security).toEqual([{ appToken: ['inbox:read'] }]);
    // Nothing undocumented, and nothing documented that no token reaches.
    const documented = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops as object).map((m) => `${m.toUpperCase()} ${path}`),
    );
    const reachable = [...new Set([...Object.keys(API_ROUTES), ...Object.keys(PERSON_ROUTES)])].map(
      (r) => r.replace(/:(\w+)/g, '{$1}'),
    );
    expect(documented.sort()).toEqual(reachable.sort());
    const ids = documented.map((d) => {
      const [method, path] = d.split(' ') as [string, string];
      return (doc.paths[path][method.toLowerCase()] as Operation).operationId;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes the query and the body from the schemas the routes parse with', async () => {
    const doc = (await t.app.inject({ method: 'GET', url: '/v1/openapi.json' })).json();
    const tasks = doc.paths['/v1/tasks'].get as Operation;
    expect(tasks.parameters.find((p) => p.name === 'view')).toMatchObject({
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['todo', 'waiting', 'asked_me', 'i_asked', 'done', 'all'],
        default: 'todo',
      },
    });
    expect(tasks.parameters.find((p) => p.name === 'limit')?.schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 500,
    });
    const search = doc.paths['/v1/search'].get as Operation;
    expect(search.parameters.find((p) => p.name === 'q')).toMatchObject({ required: true });
    const send = doc.paths['/v1/conversations/{id}/messages'].post as Operation;
    expect(send.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ]);
    const body = send.requestBody?.content['application/json'].schema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(body.required).toEqual(['clientId']);
    expect(Object.keys(body.properties)).toEqual(
      expect.arrayContaining(['clientId', 'kind', 'body', 'payload', 'replyToId', 'fileIds']),
    );
    expect(send.responses['201']?.content).toEqual({
      'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } },
    });
    expect(doc.components.schemas.MessageResponse).toMatchObject({ type: 'object' });
    expect(doc.components.schemas.ErrorResponse).toMatchObject({
      properties: {
        error: { properties: { code: { enum: expect.arrayContaining(['token_scope']) } } },
      },
    });
    // A file's bytes, not JSON.
    expect((doc.paths['/v1/files/{id}'].get as Operation).responses['200']?.content).toEqual({
      '*/*': { schema: { type: 'string', format: 'binary' } },
    });
    // A kit's key isn't a uuid.
    expect((doc.paths['/v1/kits/{key}'].put as Operation).parameters[0]?.schema).toEqual({
      type: 'string',
      maxLength: 40,
    });
    expect(doc.components.securitySchemes.personalToken.description).toContain(
      PERSONAL_SCOPES.join(', ').replace(/, ([^,]*)$/, ' and $1'),
    );
  });

  it('is served to a token too, and to nobody-in-particular, the same', async () => {
    const noor = await signup(t, { displayName: 'Noor Haddad' });
    const made = await noor.post('/v1/me/tokens', { name: 'script', scopes: ['profile:read'] });
    const asToken = await t.app.inject({
      method: 'GET',
      url: '/v1/openapi.json',
      headers: { authorization: `Bearer ${made.token}` },
    });
    // The document isn't a route a token acts through: the token is simply not needed.
    expect(asToken.statusCode).toBe(403);
    expect(asToken.json().error.code).toBe('token_route');
    const anyone = await t.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(anyone.statusCode).toBe(200);
  });
});
