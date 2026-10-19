/**
 * An organization's intake forms (M16 H5): the forms its owner and admins keep (saved whole, in
 * its order; a question kept in one of its customer fields only where the kinds agree), a Form
 * card's form as the card keeps it (a copy, so a form changed or let go never changes a card
 * sent), a customer's answers under the card's lock (theirs alone, checked by core
 * `checkAnswers`, kept in their record where a question says so), and the forms booked or
 * ordered items name, queued once the card is written and sent by the organization's
 * automatic-replies account (`org.reply`, `lib/org-replies.ts`). The answers are the customer's
 * words to the organization: on the card for both sides and its apps, never handed to a model.
 */
import {
  type BookingItem,
  type CustomerField,
  checkAnswers,
  formOf,
  type IntakeForm,
  type IntakeQuestion,
  keepsIn,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { teamOf } from './business';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { enqueue } from './jobs';
import { fieldsOf, saveCustomerRecord } from './org-customers';

type Q = Kysely<Database> | Transaction<Database>;

/** The job that sends what an organization says by itself (`lib/org-replies.ts`). */
const REPLY_JOB = 'org.reply';

/** An organization's forms, in its order. */
export async function intakeForms(db: Q, orgId: string): Promise<IntakeForm[]> {
  const rows = await db
    .selectFrom('org_forms')
    .select(['id', 'name', 'intro', 'questions'])
    .where('org_id', '=', orgId)
    .orderBy('position')
    .execute();
  return rows.map((r) => ({ id: r.id, name: r.name, intro: r.intro, questions: r.questions }));
}

/** Its forms by name, for its team to send one (the conversation's view). */
export async function formNames(
  db: Q,
  orgId: string,
): Promise<Array<{ id: string; name: string }>> {
  return db
    .selectFrom('org_forms')
    .select(['id', 'name'])
    .where('org_id', '=', orgId)
    .orderBy('position')
    .execute();
}

type QuestionInput = {
  id?: string;
  label: string;
  kind: IntakeQuestion['kind'];
  choices?: string[];
  required: boolean;
  keepAs?: string | null;
};

/**
 * Saves the organization's forms, the whole list in its order, under its row: a form or a
 * question it keeps keeps its id; one that isn't its own is new. A question kept in a customer
 * field names one of the organization's fields of its own kind, and a choice kept so takes that
 * field's choices, so whatever it's answered the record can keep. The team's devices are told.
 */
export async function saveIntakeForms(
  ctx: AppContext,
  orgId: string,
  userId: string,
  forms: Array<{ id?: string; name: string; intro?: string | null; questions: QuestionInput[] }>,
): Promise<IntakeForm[]> {
  const now = ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    const org = await trx
      .selectFrom('organizations')
      .select('customer_fields')
      .where('id', '=', orgId)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    const fields: CustomerField[] = fieldsOf(org);
    const before = new Map(
      (
        await trx
          .selectFrom('org_forms')
          .select(['id', 'questions', 'created_by', 'created_at'])
          .where('org_id', '=', orgId)
          .execute()
      ).map((r) => [r.id, r]),
    );
    const rows = forms.map((f, position) => {
      const was = f.id ? before.get(f.id) : undefined;
      const known = new Set((was?.questions ?? []).map((q) => q.id));
      const questions: IntakeQuestion[] = f.questions.map((q) => {
        const field = q.keepAs ? fields.find((x) => x.id === q.keepAs) : undefined;
        if (q.keepAs && (!field || !keepsIn(q, field)))
          throw badRequest(tr('{question} can’t be kept in that field.', { question: q.label }));
        return {
          id: q.id && known.has(q.id) ? q.id : uuidv7(),
          label: q.label,
          kind: q.kind,
          ...(q.kind === 'choice' ? { choices: field?.choices ?? q.choices ?? [] } : {}),
          required: q.required,
          keepAs: field?.id ?? null,
        };
      });
      return {
        id: was ? (f.id as string) : uuidv7(),
        org_id: orgId,
        name: f.name,
        intro: f.intro?.trim() || null,
        questions: JSON.stringify(questions),
        position,
        created_by: was ? was.created_by : userId,
        created_at: was?.created_at ?? now,
        updated_at: now,
      };
    });
    await trx.deleteFrom('org_forms').where('org_id', '=', orgId).execute();
    if (rows.length) await trx.insertInto('org_forms').values(rows).execute();
  });
  // The team's devices: the setup's list and the forms their conversations offer.
  await ctx.bus.publish(await teamOf(ctx.db, orgId), {
    type: 'business.updated',
    data: { orgId, forms: true },
  });
  return intakeForms(ctx.db, orgId);
}

/** One of the organization's forms, as a Form card copies it; refused when it isn't one. */
export async function formForCard(db: Q, orgId: string, formId: string): Promise<IntakeForm> {
  const form = (await intakeForms(db, orgId)).find((f) => f.id === formId);
  if (!form) throw badRequest(tr('That form isn’t one of the organization’s.'));
  return form;
}

/**
 * A customer's answers to a Form card, under the card's row: only the customer it was sent to,
 * once, while the organization is open, each answer checked by its question. The moved card
 * comes back with the organization and the form, for the record and the move's effects.
 */
export async function answerForm(
  ctx: AppContext,
  messageId: string,
  userId: string,
  raw: Record<string, string>,
): Promise<{ m: Message; orgId: string; form: IntakeForm; answers: Record<string, string> }> {
  return ctx.db.transaction().execute(async (trx) => {
    const m = await trx
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', messageId)
      .forUpdate()
      .executeTakeFirst();
    const card = m && !m.deleted_at && m.kind === 'kit' ? formOf(m.payload) : null;
    if (!m || !card) throw notFound(tr('That form'));
    const thread = await trx
      .selectFrom('business_threads as t')
      .innerJoin('organizations as o', 'o.id', 't.org_id')
      .select(['t.org_id', 't.customer_id', 'o.archived_at', 'o.suspended_at'])
      .where('t.conversation_id', '=', m.conversation_id)
      .executeTakeFirst();
    if (!thread || thread.customer_id !== userId)
      throw forbidden(tr('Only the customer it was sent to fills it in.'));
    // Closed or suspended, its conversations take nothing more, answers included (R42, M16 B3).
    if (thread.archived_at)
      throw new AppError(
        409,
        'org_closed',
        tr(
          'This organization closed, so nothing more is written here. Find it again to start a new conversation.',
        ),
      );
    if (thread.suspended_at)
      throw new AppError(
        409,
        'org_suspended',
        tr('This organization is suspended, so nothing is written here for now.'),
      );
    if ((m.payload as { state?: unknown }).state !== 'sent')
      throw badRequest(tr('That form was answered already.'));
    const checked = checkAnswers(card.form, raw);
    if ('error' in checked) throw badRequest(checked.error);
    const payload = m.payload as Record<string, unknown> & { history?: unknown[] };
    const updated = await trx
      .updateTable('messages')
      .set({
        payload: JSON.stringify({
          ...payload,
          answers: checked.answers,
          state: 'answered',
          history: [
            ...(payload.history ?? []),
            { state: 'answered', by: userId, at: ctx.now().toISOString() },
          ].slice(-50),
        }),
      })
      .where('id', '=', messageId)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
    return { m: updated, orgId: thread.org_id, form: card.form, answers: checked.answers };
  });
}

/**
 * The answers a form keeps in customer fields, into that customer's record (H3), by them. A
 * field let go, or a value its kind no longer holds, since the form was sent: the answers stay
 * on the card, and the rest are kept.
 */
export async function keepAnswers(
  ctx: AppContext,
  orgId: string,
  customerId: string,
  form: IntakeForm,
  answers: Record<string, string>,
): Promise<void> {
  const fields = fieldsOf(
    await ctx.db
      .selectFrom('organizations')
      .select('customer_fields')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow(),
  );
  const keep: Record<string, string> = {};
  for (const q of form.questions) {
    const answer = answers[q.id];
    const field = q.keepAs ? fields.find((f) => f.id === q.keepAs) : undefined;
    if (answer !== undefined && field && keepsIn(q, field)) keep[field.id] = answer;
  }
  if (!Object.keys(keep).length) return;
  try {
    await saveCustomerRecord(ctx, orgId, customerId, customerId, { fields: keep });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    ctx.log.warn({ err, orgId }, 'a form’s answers could not be kept in the record');
  }
}

/**
 * A booking or an order from the organization's catalog in a customer's conversation (the
 * message's effects): each form its items name is queued once, to follow the card from the
 * organization's automatic-replies account. Never to someone reached by mail, who has nowhere to
 * fill one in; a repeating appointment's later times run no effects, so its form goes once.
 */
export async function queueBookedForms(ctx: AppContext, message: Message): Promise<void> {
  if (message.kind !== 'kit') return;
  const card = (message.payload ?? {}) as {
    kit?: unknown;
    booking?: { itemId?: unknown } | null;
    order?: { lines?: Array<{ itemId?: unknown }> } | null;
  };
  const itemIds =
    card.kit === 'appointment' && typeof card.booking?.itemId === 'string'
      ? [card.booking.itemId]
      : card.kit === 'order_status' && Array.isArray(card.order?.lines)
        ? card.order.lines.map((l) => l.itemId).filter((id): id is string => typeof id === 'string')
        : [];
  if (!itemIds.length) return;
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .innerJoin('users as u', 'u.id', 't.customer_id')
    .select(['t.org_id', 'o.booking_items', 'u.kind'])
    .where('t.conversation_id', '=', message.conversation_id)
    .executeTakeFirst();
  if (thread?.kind !== 'human') return;
  const items = (Array.isArray(thread.booking_items) ? thread.booking_items : []) as BookingItem[];
  const formIds = new Set(
    itemIds
      .map((id) => items.find((i) => i.id === id)?.formId)
      .filter((id): id is string => typeof id === 'string'),
  );
  for (const formId of formIds)
    await enqueue(
      ctx,
      REPLY_JOB,
      {
        what: 'form',
        orgId: thread.org_id,
        conversationId: message.conversation_id,
        messageId: message.id,
        formId,
      },
      { dedupeKey: `form:${message.id}:${formId}` },
    );
}
