/**
 * Booking before an account (R97 (1), block C): the two forms an item's page posts for a visitor
 * (an organization's item, or a person's since C1c), each answered with a redirect back to the
 * page (`?code=`, `?booked=`, `?book-error=`), so the page renders every step itself and a
 * refresh repeats nothing.
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
  type VisitorHost,
  type VisitorRefusal,
} from '../lib/public-booking';
import { orgRowByHandle, personRowByHandle } from '../lib/public-pages';
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
  embed: z.literal('1').optional(),
});

const ConfirmForm = z.object({
  host: Handle,
  item: z.string().min(1).max(64),
  claim: z.string().min(16).max(2048),
  code: z.string().min(1).max(12),
  lang: Lang,
  embed: z.literal('1').optional(),
});

export async function publicBookingRoutes(app: FastifyInstance, ctx: AppContext) {
  const hourly = (key: string, max: number) =>
    ctx.limiter.hit(key, ctx.config.isTest ? 1000 : max, 3_600_000);

  /** Whose page the form came from: an organization's handle, else a person's (one namespace). */
  const hostByHandle = async (handle: string): Promise<VisitorHost> => {
    const org = await orgRowByHandle(ctx.db, handle);
    if (org) return { kind: 'org', row: org };
    const person = await personRowByHandle(ctx.db, handle);
    if (person) return { kind: 'person', row: person };
    throw notFound(tr('That page'));
  };

  /**
   * Back to the item's page, with the step's state in the query (the language kept), framed as it
   * came when it came from the organization's own website (M17 I17a).
   */
  const back = (
    reply: FastifyReply,
    host: VisitorHost,
    slug: string,
    state: Record<string, string>,
    lang: string | undefined,
    embed?: '1',
  ) => {
    const q = new URLSearchParams(embed ? { embed, ...state } : state);
    if (lang && (INTERFACE_LANGUAGES as readonly string[]).includes(lang)) q.set('lang', lang);
    const query = q.toString();
    const handle = encodeURIComponent(host.row.handle);
    const at = host.kind === 'org' ? `/o/${handle}` : `/@${handle}`;
    return reply.redirect(`${at}/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`, 303);
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
      const host = await hostByHandle(form.host);
      const slug = catalogOf(host.row).items.find((i) => i.id === form.item)?.slug ?? form.item;
      const refused = (reason: VisitorRefusal) => {
        ctx.metrics.publicBookings.inc({ outcome: reason });
        return back(reply, host, slug, { 'book-error': reason }, form.lang, form.embed);
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
      const started = await startVisitorBooking(ctx, host, {
        itemId: form.item,
        at: form.slot,
        name: form.name,
        email: form.email,
        site: form.embed === '1',
      });
      if (started.kind === 'refused') return refused(started.reason);
      ctx.metrics.publicBookings.inc({ outcome: 'code_sent' });
      return back(reply, host, slug, { code: started.claim }, form.lang, form.embed);
    });

    /** Step two: the code; the booking lands as the provisional person's request. */
    forms.post('/public/book/confirm', async (req, reply) => {
      const form = parse(ConfirmForm, req.body);
      const host = await hostByHandle(form.host);
      const slug = catalogOf(host.row).items.find((i) => i.id === form.item)?.slug ?? form.item;
      const counted = (outcome: VisitorRefusal | 'booked') =>
        ctx.metrics.publicBookings.inc({ outcome });
      try {
        hourly(`public-book-confirm:ip:${req.ip}`, STARTS_AN_HOUR);
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') {
          counted('too_many');
          return back(reply, host, slug, { 'book-error': 'too_many' }, form.lang, form.embed);
        }
        throw err;
      }
      const claim = await openClaim(ctx, form.claim);
      if (!claim) {
        counted('expired');
        return back(reply, host, slug, { 'book-error': 'expired' }, form.lang, form.embed);
      }
      const done = await confirmVisitorBooking(ctx, host, claim, form.code.trim());
      counted(done.kind === 'booked' ? 'booked' : done.reason);
      if (done.kind === 'refused') {
        // A wrong code is tried again on the same claim; anything else starts over.
        const again = done.reason === 'wrong_code' || done.reason === 'code_expired';
        return back(
          reply,
          host,
          slug,
          again ? { code: form.claim, 'book-error': done.reason } : { 'book-error': done.reason },
          form.lang,
          form.embed,
        );
      }
      return back(reply, host, slug, { booked: form.claim }, form.lang, form.embed);
    });
  });
}
