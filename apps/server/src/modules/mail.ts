/**
 * Caime Mail's webhooks (PRODUCT-REVIEW R75): the provider delivers a mail to a Caime address
 * here, and says how far a mail Caime sent got. Both carry the secret the operator gave the
 * provider (in the URL as `?secret=`, as the password of basic auth in the URL, or as a bearer),
 * compared in constant time; nothing else reaches these. The rules are in lib/mail-in.ts and
 * lib/mail-out.ts.
 */
import { timingSafeEqual } from 'node:crypto';
import type { MailEventsResponse, MailInboundResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { AppError, badRequest, notFound } from '../lib/errors';
import { receiveMail } from '../lib/mail-in';
import { applyMailEvents } from '../lib/mail-out';

/** A mail with its attachments, as the provider posts it (their ceiling is near this). */
const INBOUND_BODY_LIMIT = 60 * 1024 * 1024;

function givenSecret(req: FastifyRequest): string | null {
  const query = (req.query ?? {}) as { secret?: unknown };
  if (typeof query.secret === 'string' && query.secret) return query.secret;
  const auth = req.headers.authorization ?? '';
  if (/^bearer /i.test(auth)) return auth.slice(7).trim() || null;
  if (/^basic /i.test(auth)) {
    const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const at = decoded.indexOf(':');
    return at < 0 ? decoded || null : decoded.slice(at + 1) || null;
  }
  return null;
}

function fromProvider(ctx: AppContext, req: FastifyRequest) {
  const provider = ctx.mailProvider;
  const { provider: named } = req.params as { provider: string };
  if (!provider || named !== provider.name) throw notFound(tr('That'));
  const expected = ctx.config.MAIL_WEBHOOK_SECRET;
  const given = givenSecret(req);
  const ok =
    expected &&
    given &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new AppError(401, 'unauthorized', tr('That isn’t from the mail provider.'));
  return provider;
}

export async function mailRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post(
    '/mail/in/:provider',
    { bodyLimit: INBOUND_BODY_LIMIT },
    async (req): Promise<MailInboundResponse> => {
      const provider = fromProvider(ctx, req);
      const mail = provider.inbound(req.body);
      if (!mail) throw badRequest(tr('That isn’t a mail.'));
      const outcomes = await receiveMail(ctx, mail);
      return { received: true, outcomes };
    },
  );

  app.post('/mail/events/:provider', async (req): Promise<MailEventsResponse> => {
    const provider = fromProvider(ctx, req);
    const applied = await applyMailEvents(ctx, provider.events(req.body));
    return { received: true, applied };
  });
}
