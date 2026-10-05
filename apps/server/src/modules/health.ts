import type { AboutView, CountriesView, CurrenciesView, TimeZonesView } from '@caime/core';
import type { HealthResponse } from '@caime/core/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { countriesIn, currenciesIn, currentZone, suggestCountry, timeZonesIn } from '../lib/geo';
import { parse } from '../lib/validate';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  // The lists need no sign-in (sign-up uses them), so each address has a generous allowance.
  const lists = (req: FastifyRequest) =>
    ctx.limiter.hit(`lists:ip:${req.ip}`, ctx.config.isTest ? 10_000 : 120, 60_000);
  app.get('/healthz', async (): Promise<HealthResponse> => ({ ok: true }));
  // Where this Caime's policies and help live: its own pages (pages.ts), or where its operator
  // published them. Never a domain of the code's own.
  app.get('/about', async (): Promise<AboutView> => ctx.config.aboutLinks);
  // Every country, named in the asker's language, and the one their device suggests (lib/geo.ts),
  // for choosing where someone lives or an organization is based, before signing up too.
  app.get('/countries', async (req, reply): Promise<CountriesView> => {
    lists(req);
    const { locale, timeZone } = parse(
      z.object({ locale: z.string().max(35).optional(), timeZone: z.string().max(64).optional() }),
      req.query,
    );
    reply.header('cache-control', 'public, max-age=86400');
    return { countries: countriesIn(locale), suggested: suggestCountry(timeZone, locale) };
  });
  // Every currency a country uses, named in the asker's language, for the one an amount is in.
  app.get('/currencies', async (req, reply): Promise<CurrenciesView> => {
    lists(req);
    const { locale } = parse(z.object({ locale: z.string().max(35).optional() }), req.query);
    reply.header('cache-control', 'public, max-age=86400');
    return { currencies: currenciesIn(locale) };
  });
  // Every time zone, with its city, country and offset now, for choosing where someone's times
  // are. Offsets move with summer time, so it's kept an hour.
  app.get('/time-zones', async (req, reply): Promise<TimeZonesView> => {
    lists(req);
    const { locale, timeZone } = parse(
      z.object({ locale: z.string().max(35).optional(), timeZone: z.string().max(64).optional() }),
      req.query,
    );
    reply.header('cache-control', 'public, max-age=3600');
    // The asker's device's, by the name the list has for it.
    return { zones: timeZonesIn(locale, ctx.now()), suggested: currentZone(timeZone) };
  });
  app.get('/readyz', async (_req, reply): Promise<HealthResponse | FastifyReply> => {
    try {
      await sql`select 1`.execute(ctx.db);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });
}
