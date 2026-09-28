import type { AboutView, CountriesView } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { countriesIn, suggestCountry } from '../lib/geo';
import { parse } from '../lib/validate';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/healthz', async () => ({ ok: true }));
  // Where this Caishy's policies and help live: its own pages (pages.ts), or where its operator
  // published them. Never a domain of the code's own.
  app.get('/about', async (): Promise<AboutView> => ctx.config.aboutLinks);
  // Every country, named in the asker's language, and the one their device suggests (lib/geo.ts),
  // for choosing where someone lives or an organization is based, before signing up too.
  app.get('/countries', async (req, reply): Promise<CountriesView> => {
    const { locale, timeZone } = parse(
      z.object({ locale: z.string().max(35).optional(), timeZone: z.string().max(64).optional() }),
      req.query,
    );
    reply.header('cache-control', 'public, max-age=86400');
    return { countries: countriesIn(locale), suggested: suggestCountry(timeZone, locale) };
  });
  app.get('/readyz', async (_req, reply) => {
    try {
      await sql`select 1`.execute(ctx.db);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });
}
