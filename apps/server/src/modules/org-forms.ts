/**
 * An organization's intake forms (M16 H5): its team reads them (to send one), its owner and
 * admins keep them on the setup screen, and a customer answers a Form card sent to them, on the
 * card. See `lib/org-forms.ts`.
 */
import { AnswersBody, IntakeFormsBody, type IntakeFormsResponse } from '@caime/core';
import type { MessageResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { assertCanWrite } from '../lib/blocks';
import { customerMask } from '../lib/business';
import { afterCardMove } from '../lib/card-moves';
import { membership } from '../lib/conversation-views';
import { notFound } from '../lib/errors';
import { answerForm, intakeForms, keepAnswers, saveIntakeForms } from '../lib/org-forms';
import { managerSeat, orgSeat } from '../lib/orgs';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function orgFormRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });

  app.get('/orgs/:id/forms', async (req): Promise<IntakeFormsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound(tr('That organization'));
    return { forms: await intakeForms(ctx.db, id) };
  });

  app.put('/orgs/:id/forms', async (req): Promise<IntakeFormsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(IntakeFormsBody, req.body);
    await managerSeat(ctx.db, auth.userId, id);
    return { forms: await saveIntakeForms(ctx, id, auth.userId, body.forms) };
  });

  // A customer's answers to a Form card sent to them: the card moves to answered, as any card's
  // move does (the team who sent it told, the organization's apps too), and the answers kept in
  // customer fields go into their record.
  app.post('/messages/:id/answers', async (req): Promise<MessageResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(AnswersBody, req.body);
    const found = await ctx.db
      .selectFrom('messages')
      .select('conversation_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!found) throw notFound(tr('That form'));
    await membership(ctx, auth.userId, found.conversation_id);
    await assertCanWrite(ctx, found.conversation_id, auth.userId);
    const done = await answerForm(ctx, id, auth.userId, body.answers);
    await keepAnswers(ctx, done.orgId, auth.userId, done.form, done.answers);
    const message = await afterCardMove(ctx, done.m, {
      from: 'sent',
      to: 'answered',
      actorId: auth.userId,
      business: await customerMask(ctx.db, found.conversation_id),
    });
    return { message };
  });
}
