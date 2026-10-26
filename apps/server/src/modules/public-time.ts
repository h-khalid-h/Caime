/**
 * Another time for a booking made before an account, answered from the mail (M16 F5c): the one
 * form the host's page posts for it, answered with a redirect back to that page (`?time=`, the
 * claim the mail carried), which reads the card again and says where it stands, so a refresh
 * repeats nothing. Anonymous, in its own plugin as booking's two are: nothing is read or made of
 * a session, and the claim (the card, the booker, the time asked) is all that answers.
 */
import { INTERFACE_LANGUAGES } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { AppError } from '../lib/errors';
import { STARTS_AN_HOUR } from '../lib/public-booking';
import { answerVisitorTime, timePage } from '../lib/public-time';
import { parse } from '../lib/validate';

const AnswerForm = z.object({
  claim: z.string().min(16).max(2048),
  answer: z.enum(['yes', 'no']),
  lang: z.string().max(8).optional(),
});

export async function publicTimeRoutes(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (forms) => {
    forms.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 8_192 },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    forms.post('/public/time', async (req, reply) => {
      const form = parse(AnswerForm, req.body);
      const query = (extra: Record<string, string> = {}) => {
        const q = new URLSearchParams({ time: form.claim, ...extra });
        if (form.lang && (INTERFACE_LANGUAGES as readonly string[]).includes(form.lang))
          q.set('lang', form.lang);
        return q.toString();
      };
      try {
        ctx.limiter.hit(
          `public-time:ip:${req.ip}`,
          ctx.config.isTest ? 1000 : STARTS_AN_HOUR,
          3_600_000,
        );
      } catch (err) {
        if (err instanceof AppError && err.code === 'rate_limited') {
          ctx.metrics.publicBookings.inc({ outcome: 'too_many' });
          const page = await timePage(ctx, form.claim);
          return reply.redirect(
            page ? `${page}?${query({ 'time-error': 'too_many' })}#time` : '/',
            303,
          );
        }
        throw err;
      }
      const done = await answerVisitorTime(ctx, form.claim, form.answer === 'yes');
      ctx.metrics.publicBookings.inc({
        outcome: done.outcome === 'changed' ? 'time_changed' : `time_${done.outcome}`,
      });
      // The page reads the card again: answered, changed since, or run out, it says which.
      return reply.redirect(done.page ? `${done.page}?${query()}#time` : '/', 303);
    });
  });
}
