/**
 * Booking before an account (R97 (1), block C): the two forms an organization's item page posts
 * for a visitor, each answered with a redirect back to the page (`?code=`, `?booked=`,
 * `?book-error=`), so the page renders every step itself and a refresh repeats nothing.
 * Only these two take forms, in their own plugin as OAuth's do: a form is anonymous here (no
 * session is read or made), the choice rides as a sealed claim, and nothing is booked until
 * the address's code comes back, so a form posted from another site can only cost its author a
 * code mail, which the limits bound.
 */
import { INTERFACE_LANGUAGES } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { catalogOf } from '../lib/booking';
import { AppError, notFound } from '../lib/errors';
import {
  CODES_AN_HOUR,
  confirmVisitorBooking,
  openClaim,
  STARTS_AN_HOUR,
  startVisitorBooking,
  type VisitorRefusal,
} from '../lib/public-booking';
import { orgRowByHandle } from '../lib/public-pages';
import { parse } from '../lib/validate';

const Handle = z.string().min(1).max(64);
const Lang = z.string().max(8).optional();

const StartForm = z.object({
  host: Handle,
  item: z.string().min(1).max(64),
  slot: z.string().min(1).max(40),
  name: z.string().max(80).default(''),
  email: z.string().min(3).max(254),
  adult: z.string().optional(),
  lang: Lang,
});

const ConfirmForm = z.object({
  host: Handle,
  item: z.string().min(1).max(64),
  claim: z.string().min(16).max(2048),
  code: z.string().min(1).max(12),
  lang: Lang,
});

export async function publicBookingRoutes(app: FastifyInstance, ctx: AppContext) {
  const hourly = (key: string, max: number) =>
    ctx.limiter.hit(key, ctx.config.isTest ? 1000 : max, 3_600_000);

  /** Back to the item's page, with the step's state in the query (the language kept). */
  const back = (
    reply: FastifyReply,
    handle: string,
    slug: string,
    state: Record<string, string>,
    lang: string | undefined,
  ) => {
    const q = new URLSearchParams(state);
    if (lang && (INTERFACE_LANGUAGES as readonly string[]).includes(lang)) q.set('lang', lang);
    const query = q.toString();
    return reply.redirect(
      `/o/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`,
      303,
    );
  };

  await app.register(async (forms) => {
    forms.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 8_192 },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    /** Step one: the time, the name and the address; a code goes to the address. */
    forms.post('/public/book', async (req, reply) => {
      const form = parse(StartForm, req.body);
      const org = await orgRowByHandle(ctx.db, form.host);
      if (!org) throw notFound(tr('That organization'));
      const slug = catalogOf(org).items.find((i) => i.id === form.item)?.slug ?? form.item;
      const refused = (reason: VisitorRefusal) => {
        ctx.metrics.publicBookings.inc({ outcome: reason });
        return back(reply, org.handle, slug, { 'book-error': reason }, form.lang);
      };
      // Without an account nobody says their age: the box stands for it (R29).
      if (form.adult !== 'on') return refused('adult');
      try {
        hourly(`public-book:ip:${req.ip}`, STARTS_AN_HOUR);
        hourly(`public-book:email:${form.email.trim().toLowerCase()}`, CODES_AN_HOUR);
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') return refused('too_many');
        throw err;
      }
      const started = await startVisitorBooking(ctx, org, {
        itemId: form.item,
        at: form.slot,
        name: form.name,
        email: form.email,
      });
      if (started.kind === 'refused') return refused(started.reason);
      ctx.metrics.publicBookings.inc({ outcome: 'code_sent' });
      return back(reply, org.handle, slug, { code: started.claim }, form.lang);
    });

    /** Step two: the code; the booking lands as the provisional person's request. */
    forms.post('/public/book/confirm', async (req, reply) => {
      const form = parse(ConfirmForm, req.body);
      const org = await orgRowByHandle(ctx.db, form.host);
      if (!org) throw notFound(tr('That organization'));
      const slug = catalogOf(org).items.find((i) => i.id === form.item)?.slug ?? form.item;
      const counted = (outcome: VisitorRefusal | 'booked') =>
        ctx.metrics.publicBookings.inc({ outcome });
      try {
        hourly(`public-book-confirm:ip:${req.ip}`, STARTS_AN_HOUR);
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') {
          counted('too_many');
          return back(reply, org.handle, slug, { 'book-error': 'too_many' }, form.lang);
        }
        throw err;
      }
      const claim = await openClaim(ctx, form.claim);
      if (!claim) {
        counted('expired');
        return back(reply, org.handle, slug, { 'book-error': 'expired' }, form.lang);
      }
      const done = await confirmVisitorBooking(ctx, org, claim, form.code.trim());
      counted(done.kind === 'booked' ? 'booked' : done.reason);
      if (done.kind === 'refused') {
        // A wrong code is tried again on the same claim; anything else starts over.
        const again = done.reason === 'wrong_code' || done.reason === 'code_expired';
        return back(
          reply,
          org.handle,
          slug,
          again ? { code: form.claim, 'book-error': done.reason } : { 'book-error': done.reason },
          form.lang,
        );
      }
      return back(reply, org.handle, slug, { booked: form.claim }, form.lang);
    });
  });
}
