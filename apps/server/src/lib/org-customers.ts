/**
 * What an organization's team keeps about its customers (M16 H3): one record per customer (a
 * note, tags, the values of the fields the organization defines), read and written by its team
 * alone and never shown to the customer, never handed to a model. It goes when the customer asks
 * the organization to erase their conversation, when they delete their account, and when a closed
 * organization is cleared; it's in the organization's export.
 */
import {
  type CustomerField,
  type CustomerRecordView,
  cleanTags,
  fieldValue,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { teamOf } from './business';
import { badRequest, notFound } from './errors';

type Q = Kysely<Database> | Transaction<Database>;

/** An organization's fields as kept (a column of its own, defaulted to none). */
export function fieldsOf(org: { customer_fields: CustomerField[] | null }): CustomerField[] {
  return Array.isArray(org.customer_fields) ? org.customer_fields : [];
}

/** The customer has written to it (or it to them): a record is kept only for someone it serves. */
async function assertCustomerOf(db: Q, orgId: string, customerId: string): Promise<void> {
  const thread = await db
    .selectFrom('business_threads')
    .select('conversation_id')
    .where('org_id', '=', orgId)
    .where('customer_id', '=', customerId)
    .limit(1)
    .executeTakeFirst();
  if (!thread) throw notFound(tr('That customer'));
}

export async function customerRecord(
  ctx: AppContext,
  orgId: string,
  customerId: string,
): Promise<CustomerRecordView> {
  await assertCustomerOf(ctx.db, orgId, customerId);
  const row = await ctx.db
    .selectFrom('org_customers as c')
    .leftJoin('users as u', 'u.id', 'c.updated_by')
    .select(['c.note', 'c.tags', 'c.fields', 'c.updated_at', 'c.updated_by', 'u.display_name'])
    .where('c.org_id', '=', orgId)
    .where('c.customer_id', '=', customerId)
    .executeTakeFirst();
  return {
    customerId,
    note: row?.note ?? null,
    tags: row?.tags ?? [],
    fields: row?.fields ?? {},
    updatedAt: row?.updated_at.toISOString() ?? null,
    updatedBy:
      row?.updated_by && row.display_name
        ? { userId: row.updated_by, displayName: row.display_name }
        : null,
  };
}

/**
 * Changes what the team keeps about a customer: the note, the whole list of tags, the values of
 * the fields named (each checked by its kind; empty clears one). Under the record's row, so two
 * of the team at once keep both changes; the team's views of the customer's conversations are
 * told.
 */
export async function saveCustomerRecord(
  ctx: AppContext,
  orgId: string,
  customerId: string,
  userId: string,
  body: { note?: string | null; tags?: string[]; fields?: Record<string, string> },
): Promise<CustomerRecordView> {
  await assertCustomerOf(ctx.db, orgId, customerId);
  const org = await ctx.db
    .selectFrom('organizations')
    .select('customer_fields')
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
  const defined = fieldsOf(org);
  // Each value as its field's kind keeps it, or the refusal says which field and why.
  const changes: Record<string, string | null> = {};
  for (const [id, raw] of Object.entries(body.fields ?? {})) {
    const field = defined.find((f) => f.id === id);
    if (!field) throw badRequest(tr('That field isn’t one of the organization’s.'));
    const kept = fieldValue(field, raw);
    if ('error' in kept)
      throw badRequest(tr('{field}: {problem}', { field: field.label, problem: kept.error }));
    changes[id] = kept.value;
  }
  const now = ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('org_customers')
      .values({ org_id: orgId, customer_id: customerId, updated_by: userId, updated_at: now })
      .onConflict((oc) => oc.columns(['org_id', 'customer_id']).doNothing())
      .execute();
    const row = await trx
      .selectFrom('org_customers')
      .select(['note', 'tags', 'fields'])
      .where('org_id', '=', orgId)
      .where('customer_id', '=', customerId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const fields = { ...row.fields };
    for (const [id, value] of Object.entries(changes))
      if (value === null) delete fields[id];
      else fields[id] = value;
    await trx
      .updateTable('org_customers')
      .set({
        ...(body.note !== undefined ? { note: body.note?.trim() || null } : {}),
        ...(body.tags !== undefined ? { tags: cleanTags(body.tags) } : {}),
        fields: JSON.stringify(fields),
        updated_by: userId,
        updated_at: now,
      })
      .where('org_id', '=', orgId)
      .where('customer_id', '=', customerId)
      .execute();
  });
  // The team's views of their conversations (the inbox's tags) and of the record ask again.
  const threads = await ctx.db
    .selectFrom('business_threads')
    .select('conversation_id')
    .where('org_id', '=', orgId)
    .where('customer_id', '=', customerId)
    .execute();
  const team = await teamOf(ctx.db, orgId);
  for (const t of threads)
    await ctx.bus.publish(team, {
      type: 'business.updated',
      data: { orgId, threadId: t.conversation_id, customerId },
    });
  return customerRecord(ctx, orgId, customerId);
}

/** The tags the team uses, most used first: what the inbox filters by and offers when tagging. */
export async function tagsInUse(
  db: Q,
  orgId: string,
): Promise<Array<{ tag: string; count: number }>> {
  const rows = await sql<{ tag: string; count: number }>`
    select tag, count(*)::int as count
    from org_customers, unnest(tags) as tag
    where org_id = ${orgId}
    group by tag
    order by count desc, tag
    limit 50
  `.execute(db);
  return rows.rows;
}

/** The customers who have a tag: the inbox's filter. */
export async function customersTagged(db: Q, orgId: string, tag: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom('org_customers')
    .select('customer_id')
    .where('org_id', '=', orgId)
    .where(sql<boolean>`${tag} = any(tags)`)
    .execute();
  return new Set(rows.map((r) => r.customer_id));
}

/**
 * Saves the organization's fields, the whole list in its order: a field it keeps keeps its id
 * (and every customer's value for it); a new one gets an id; one left out goes, with every
 * customer's value for it.
 */
export async function saveCustomerFields(
  ctx: AppContext,
  orgId: string,
  fields: Array<{ id?: string; label: string; kind: CustomerField['kind']; choices?: string[] }>,
): Promise<CustomerField[]> {
  return ctx.db.transaction().execute(async (trx) => {
    const org = await trx
      .selectFrom('organizations')
      .select('customer_fields')
      .where('id', '=', orgId)
      .forNoKeyUpdate()
      .executeTakeFirstOrThrow();
    const before = new Set(fieldsOf(org).map((f) => f.id));
    const next: CustomerField[] = fields.map((f) => ({
      // An id that isn't one of its fields is a new field.
      id: f.id && before.has(f.id) ? f.id : uuidv7(),
      label: f.label,
      kind: f.kind,
      ...(f.kind === 'choice' ? { choices: cleanTags(f.choices ?? []) } : {}),
    }));
    const gone = [...before].filter((id) => !next.some((f) => f.id === id));
    await trx
      .updateTable('organizations')
      .set({ customer_fields: JSON.stringify(next), updated_at: ctx.now() })
      .where('id', '=', orgId)
      .execute();
    if (gone.length)
      await sql`
        update org_customers set fields = fields - ${sql.val(gone)}::text[]
        where org_id = ${orgId}
      `.execute(trx);
    return next;
  });
}
