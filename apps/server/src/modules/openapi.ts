/**
 * The API as a document (R79, R78): OpenAPI 3.1 for the token-reachable routes, written from
 * the schemas the routes parse with (`lib/openapi.ts`). Anyone reads it, signed in or not: it
 * says nothing `docs/API.md` doesn't, and a platform importing it has no session yet.
 */
import type { OpenApiDocument } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { openApiDocument } from '../lib/openapi';

export async function openApiRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/openapi.json', async (_req, reply): Promise<OpenApiDocument> => {
    reply.header('cache-control', 'public, max-age=600');
    return openApiDocument(ctx.config.PUBLIC_URL);
  });
}
