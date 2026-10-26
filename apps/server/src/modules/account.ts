/**
 * Your data (docs/SECURITY.md): download everything Caime keeps about you (lib/export.ts), and
 * delete your account for good, once your password says it's you (lib/account-deletion.ts does
 * the deleting, for this route and for a child's account its parent ends, R122).
 */
import type { OkResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { deleteAccount } from '../lib/account-deletion';
import { audit } from '../lib/audit';
import { verifyPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import { buildExport } from '../lib/export';
import { clearSessionCookie } from '../lib/session-cookie';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function accountRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/me/export', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`export:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const found = await ctx.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', me)
      .executeTakeFirst();
    if (!found) throw notFound(tr('Your account'));
    const now = ctx.now();
    const archive = await buildExport(ctx, me, now);
    await audit(ctx.db, { actorId: me, action: 'account.exported' });
    const date = now.toISOString().slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="caime-export-${date}.json"`)
      .header('cache-control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(archive, null, 2));
  });

  app.delete('/me', async (req, reply): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { password } = parse(
      z.object({ password: z.string().min(1, 'Enter your password.').max(200) }),
      req.body,
    );
    ctx.limiter.hit(`delete:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const me = auth.userId;
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('id', '=', me)
      .executeTakeFirst();
    if (!user) throw notFound(tr('Your account'));
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'invalid_credentials', tr('That password isn’t right.'));
    }
    await deleteAccount(ctx, me);
    clearSessionCookie(reply, ctx);
    return { ok: true };
  });
}
