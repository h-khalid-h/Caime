/**
 * A customer's conversation with an organization (R14, R64): one thread per organization,
 * person and writing-as, started by the customer's first word, whether typed on Caime or sent
 * as mail to the organization's address (R75). The route and the mail path both start it here.
 */
import { minorMayWriteToOrg, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { orgBlocked } from './blocks';
import { teamOf } from './business';
import { AppError, forbidden } from './errors';
import { recordEvent } from './events';
import { minorOf } from './users';

export async function startCustomerConversation(
  ctx: AppContext,
  customer: { id: string; birth_date: string | null; time_zone: string },
  org: Pick<Organization, 'id' | 'name' | 'verified_at'>,
  asOrgId: string | null,
): Promise<{ conversationId: string; created: boolean }> {
  // Under 18, only an organization that has proved who it is: a school, a club, a clinic (R29).
  if (!minorMayWriteToOrg(minorOf(customer, ctx.now()), org.verified_at !== null))
    throw forbidden(
      tr(
        'Under 18, you can message organizations that have verified who they are. {name} hasn’t yet.',
        { name: org.name },
      ),
    );
  if (await orgBlocked(ctx.db, customer.id, org.id))
    throw new AppError(
      403,
      'org_blocked',
      tr('You blocked {name}. Unblock it to write to it again.', { name: org.name }),
    );
  const thread = () =>
    ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', org.id)
      .where('customer_id', '=', customer.id)
      .where((eb) =>
        asOrgId ? eb('customer_org_id', '=', asOrgId) : eb('customer_org_id', 'is', null),
      )
      .executeTakeFirst();
  const existing = await thread();
  if (existing) {
    // Back in it if they had archived it.
    await ctx.db
      .updateTable('participants')
      .set({ archived_at: null, left_at: null })
      .where('conversation_id', '=', existing.conversation_id)
      .where('user_id', '=', customer.id)
      .execute();
    return { conversationId: existing.conversation_id, created: false };
  }
  // Nobody new starts one with a suspended organization (M16 B3); one already there stays to read.
  const standing = await ctx.db
    .selectFrom('organizations')
    .select('suspended_at')
    .where('id', '=', org.id)
    .executeTakeFirst();
  if (standing?.suspended_at)
    throw new AppError(
      409,
      'org_suspended',
      tr('This organization is suspended, so nothing is written here for now.'),
    );
  ctx.limiter.hit(`business-start:${customer.id}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
  const conversationId = uuidv7();
  const team = await teamOf(ctx.db, org.id);
  try {
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('conversations')
        .values({ id: conversationId, kind: 'business', org_id: org.id, created_by: customer.id })
        .execute();
      await trx
        .insertInto('participants')
        .values([
          { conversation_id: conversationId, user_id: customer.id, role: 'member' },
          ...team.map((userId) => ({
            conversation_id: conversationId,
            user_id: userId,
            role: 'agent' as const,
          })),
        ])
        .execute();
      await trx
        .insertInto('business_threads')
        .values({
          conversation_id: conversationId,
          org_id: org.id,
          customer_id: customer.id,
          customer_org_id: asOrgId ?? null,
          created_at: ctx.now(),
          updated_at: ctx.now(),
        })
        .execute();
      await recordEvent(trx, 'conversation.created', customer.id, {
        conversationId,
        kind: 'business',
        orgId: org.id,
      });
    });
  } catch (err) {
    // Two starts at once: the first one's conversation is theirs.
    if ((err as { code?: string }).code !== '23505') throw err;
    const winner = await thread();
    if (!winner) throw err;
    return { conversationId: winner.conversation_id, created: false };
  }
  await ctx.bus.publish([customer.id], {
    type: 'conversation.created',
    data: { conversationId },
  });
  return { conversationId, created: true };
}
