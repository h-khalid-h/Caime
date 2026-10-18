/**
 * What a suspended account may still do (M16 B6), each through the claim its sign-in was refused
 * with (`lib/suspension.ts`): appeal, once at a time, and take a copy of its data. Neither reads
 * or makes a session: a suspended account is never signed in.
 */
import { AppealBody, SuspensionClaimBody } from '@caime/core';
import type { AppealSentResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { buildExport } from '../lib/export';
import { appeal, openSuspensionClaim } from '../lib/suspension';
import { parse } from '../lib/validate';

const claimGone = () =>
  new AppError(
    403,
    'forbidden',
    tr('That took too long, or the account isn’t suspended any more. Sign in again.'),
  );

export async function suspensionRoutes(app: FastifyInstance, ctx: AppContext) {
  /** An appeal: why they think the suspension is wrong; `already` when one is waiting. */
  app.post('/suspension/appeal', async (req): Promise<AppealSentResponse> => {
    const body = parse(AppealBody, req.body);
    ctx.limiter.hit(`appeal:ip:${req.ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const who = await openSuspensionClaim(ctx, body.claim);
    if (!who) throw claimGone();
    const made = await appeal(ctx, who.userId, body.text);
    return { ok: true, already: !made };
  });

  /** Their data, as the export gives it to someone signed in (GDPR Art. 20). */
  app.post('/suspension/export', async (req, reply): Promise<FastifyReply> => {
    const body = parse(SuspensionClaimBody, req.body);
    const who = await openSuspensionClaim(ctx, body.claim);
    if (!who) throw claimGone();
    ctx.limiter.hit(`export:${who.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const now = ctx.now();
    const archive = await buildExport(ctx, who.userId, now);
    await audit(ctx.db, {
      actorId: who.userId,
      action: 'account.exported',
      metadata: { suspended: true },
    });
    const date = now.toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="caime-export-${date}.json"`)
      .header('cache-control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(archive, null, 2));
  });
}
