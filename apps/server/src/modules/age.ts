/**
 * Age assurance's routes (M16 B7): a check begun by its person (signed in), the person's return
 * from the provider's page (a browser's redirect, no session needed: the check's reference says
 * whose it is, and the provider is asked what it found), and the provider's signed notice. Both
 * of the last two apply through `applyAgeResult`, so whichever lands first decides and the other
 * changes nothing.
 */
import {
  AGE_APP_RETURN_PATH,
  AGE_TRIGGERS,
  AGE_WEB_RETURN_PATH,
  type AgeReturnState,
} from '@caime/core/age-assurance';
import { type AgeCheckStartResponse, APP_SCHEME } from '@caime/core/api';
import { AgeCheckStartBody } from '@caime/core/schemas';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { ageReturnTarget, applyAgeResult, startAgeCheck } from '../lib/age';
import { languageOfRequest } from '../lib/i18n';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const ReturnQuery = z.object({
  ref: z.string().max(64).default(''),
  end: z.enum(['done', 'error', 'cancel']).default('done'),
});

const StartQuery = z.object({ trigger: z.enum(AGE_TRIGGERS).optional() });

export async function ageRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/me/age-check', async (req): Promise<AgeCheckStartResponse> => {
    const auth = requireAuth(req);
    const body = parse(AgeCheckStartBody, req.body ?? {});
    const { trigger } = parse(StartQuery, req.query);
    const url = await startAgeCheck(ctx, auth.userId, {
      back: body.back,
      trigger: trigger ?? null,
      language: languageOfRequest(req),
    });
    return { url };
  });

  app.get('/age/return', async (req, reply): Promise<FastifyReply> => {
    ctx.limiter.hit(`age-return:${req.ip}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    const q = parse(ReturnQuery, req.query);
    const target = await ageReturnTarget(ctx, q.ref);
    const base = ctx.config.PUBLIC_URL;
    const land = (back: 'web' | 'app', state: AgeReturnState) =>
      reply
        .header('cache-control', 'no-store')
        .redirect(
          back === 'app'
            ? `${APP_SCHEME}://${AGE_APP_RETURN_PATH}?age=${state}`
            : `${base}/${AGE_WEB_RETURN_PATH}?age=${state}`,
          303,
        );
    if (!target || !ctx.age) return land('web', 'waiting');
    if (q.end === 'cancel') return land(target.back, 'cancel');
    // Asked of the provider rather than read from the address: anyone can type a return.
    let state: AgeReturnState = 'waiting';
    try {
      const found = await ctx.age.lookup(q.ref);
      if (found) {
        await applyAgeResult(ctx, q.ref, found);
        state = found.outcome;
      }
    } catch (err) {
      // The notice still comes; the page says it's on its way.
      req.log.warn({ err }, 'age check lookup failed');
    }
    // What the account stands at now (an earlier notice may have said more than this lookup).
    const now = await ctx.db
      .selectFrom('age_checks')
      .select(['outcome'])
      .where('id', '=', q.ref)
      .executeTakeFirst();
    if (now?.outcome) state = now.outcome;
    return land(target.back, state);
  });

  app.post('/age/webhook/:provider', async (req, reply): Promise<FastifyReply> => {
    const { provider } = req.params as { provider: string };
    if (!ctx.age || provider !== ctx.age.id) return reply.status(404).send();
    const notice = await ctx.age.notice(req.body, req.headers);
    if (!notice) return reply.status(400).send();
    await applyAgeResult(ctx, notice.reference, notice.result);
    return reply.status(200).send({ ok: true });
  });
}
