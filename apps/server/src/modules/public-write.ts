/**
 * Writing before an account (R97 (1), M16 C1d): the two forms an organization's page posts for a
 * visitor, each answered with a redirect back to the page (`?write-code=`, `?written=`,
 * `?write-error=`, at `#write`), so the page renders every step itself and a refresh repeats
 * nothing. As booking's two (`public-booking.ts`), in their own plugin: a form is anonymous here
 * (no session is read or made), what was written rides as a sealed claim, and nothing is posted
 * until the address's code comes back, so a form posted from another site can only cost its
 * author a code mail, which the limits bound.
 */
import { INTERFACE_LANGUAGES } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { CODES_AN_HOUR, STARTS_AN_HOUR } from '../lib/public-booking';
import { orgRowByHandle } from '../lib/public-pages';
import {
  confirmVisitorWrite,
  openWriteClaim,
  startVisitorWrite,
  WRITE_MAX,
  type WriteRefusal,
} from '../lib/public-write';
import { parse } from '../lib/validate';

const Handle = z.string().min(1).max(64);
const Lang = z.string().max(8).optional();

const StartForm = z.object({
  org: Handle,
  name: z.string().max(80).default(''),
  email: z.string().min(3).max(254),
  // A browser sends a line break as two characters: room for that, the words counted after.
  message: z.string().max(WRITE_MAX * 2),
  adult: z.string().optional(),
  lang: Lang,
});

const ConfirmForm = z.object({
  org: Handle,
  claim: z.string().min(16).max(8192),
  code: z.string().min(1).max(12),
  lang: Lang,
});

export async function publicWriteRoutes(app: FastifyInstance, ctx: AppContext) {
  const hourly = (key: string, max: number) =>
    ctx.limiter.hit(key, ctx.config.isTest ? 1000 : max, 3_600_000);

  const orgByHandle = async (handle: string): Promise<Organization> => {
    const org = await orgRowByHandle(ctx.db, handle);
    if (!org) throw notFound(tr('That page'));
    return org;
  };

  /** Back to the organization's page at its form, with the step in the query (the language kept). */
  const back = (
    reply: FastifyReply,
    org: Organization,
    state: Record<string, string>,
    lang: string | undefined,
  ) => {
    const q = new URLSearchParams(state);
    if (lang && (INTERFACE_LANGUAGES as readonly string[]).includes(lang)) q.set('lang', lang);
    return reply.redirect(`/o/${encodeURIComponent(org.handle)}?${q.toString()}#write`, 303);
  };

  await app.register(async (forms) => {
    forms.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 16_384 },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    /** Step one: the name, the address and the message; a code goes to the address. */
    forms.post('/public/write', async (req, reply) => {
      const form = parse(StartForm, req.body);
      const org = await orgByHandle(form.org);
      const refused = (reason: WriteRefusal) => {
        ctx.metrics.publicWrites.inc({ outcome: reason });
        return back(reply, org, { write: '', 'write-error': reason }, form.lang);
      };
      try {
        hourly(`public-write:ip:${req.ip}`, STARTS_AN_HOUR);
        hourly(`public-write:email:${form.email.trim().toLowerCase()}`, CODES_AN_HOUR);
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') return refused('too_many');
        throw err;
      }
      const started = await startVisitorWrite(ctx, org, {
        name: form.name,
        email: form.email,
        body: form.message,
        // Without an account nobody says their age: the box stands for it, where it's asked (R29).
        adult: form.adult === 'on',
      });
      if (started.kind === 'refused') return refused(started.reason);
      ctx.metrics.publicWrites.inc({ outcome: 'code_sent' });
      return back(reply, org, { 'write-code': started.claim }, form.lang);
    });

    /** Step two: the code; the message lands as the provisional person's, in the inbox. */
    forms.post('/public/write/confirm', async (req, reply) => {
      const form = parse(ConfirmForm, req.body);
      const org = await orgByHandle(form.org);
      const counted = (outcome: WriteRefusal | 'written') =>
        ctx.metrics.publicWrites.inc({ outcome });
      try {
        hourly(`public-write-confirm:ip:${req.ip}`, STARTS_AN_HOUR);
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') {
          counted('too_many');
          return back(
            reply,
            org,
            { 'write-code': form.claim, 'write-error': 'too_many' },
            form.lang,
          );
        }
        throw err;
      }
      const claim = await openWriteClaim(ctx, form.claim);
      if (!claim) {
        counted('expired');
        return back(reply, org, { write: '', 'write-error': 'expired' }, form.lang);
      }
      const done = await confirmVisitorWrite(ctx, org, claim, form.code.trim());
      counted(done.kind === 'written' ? 'written' : done.reason);
      if (done.kind === 'written') return back(reply, org, { written: form.claim }, form.lang);
      // A wrong code is tried again on the same claim; a code that ran out goes back to the form
      // with what they wrote, to send for a new one; anything else starts over.
      const state: Record<string, string> =
        done.reason === 'wrong_code'
          ? { 'write-code': form.claim, 'write-error': done.reason }
          : done.reason === 'code_expired'
            ? { 'write-again': form.claim, 'write-error': done.reason }
            : { write: '', 'write-error': done.reason };
      return back(reply, org, state, form.lang);
    });
  });
}
