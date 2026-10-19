/**
 * What an organization's team keeps about its customers (M16 H3): a customer's record, read and
 * changed by anyone on the team; the tags it uses; the fields it keeps, defined by its owner and
 * admins on the setup screen.
 */
import {
  CustomerFieldsBody,
  type CustomerFieldsResponse,
  CustomerRecordBody,
  type CustomerRecordResponse,
  type CustomerTagsResponse,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import {
  customerRecord,
  fieldsOf,
  saveCustomerFields,
  saveCustomerRecord,
  tagsInUse,
} from '../lib/org-customers';
import { managerSeat, orgSeat } from '../lib/orgs';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function orgCustomerRoutes(app: FastifyInstance, ctx: AppContext) {
  const orgParam = z.object({ id: z.string().uuid() });
  const customerParam = z.object({ id: z.string().uuid(), customerId: z.string().uuid() });

  /** A seat on its team (a closed organization's seats ended as it closed), else not there. */
  const teamSeat = async (userId: string, orgId: string) => {
    if (!(await orgSeat(ctx.db, userId, orgId))) throw notFound(tr('That organization'));
  };
  const fields = async (orgId: string) =>
    fieldsOf(
      await ctx.db
        .selectFrom('organizations')
        .select('customer_fields')
        .where('id', '=', orgId)
        .executeTakeFirstOrThrow(),
    );

  app.get('/orgs/:id/customers/:customerId', async (req): Promise<CustomerRecordResponse> => {
    const auth = requireAuth(req);
    const { id, customerId } = parse(customerParam, req.params);
    await teamSeat(auth.userId, id);
    return { record: await customerRecord(ctx, id, customerId), fields: await fields(id) };
  });

  app.patch('/orgs/:id/customers/:customerId', async (req): Promise<CustomerRecordResponse> => {
    const auth = requireAuth(req);
    const { id, customerId } = parse(customerParam, req.params);
    const body = parse(CustomerRecordBody, req.body);
    await teamSeat(auth.userId, id);
    return {
      record: await saveCustomerRecord(ctx, id, customerId, auth.userId, body),
      fields: await fields(id),
    };
  });

  app.get('/orgs/:id/customer-tags', async (req): Promise<CustomerTagsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await teamSeat(auth.userId, id);
    return { tags: await tagsInUse(ctx.db, id) };
  });

  app.put('/orgs/:id/customer-fields', async (req): Promise<CustomerFieldsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    const body = parse(CustomerFieldsBody, req.body);
    await managerSeat(ctx.db, auth.userId, id);
    return { fields: await saveCustomerFields(ctx, id, body.fields) };
  });
}
