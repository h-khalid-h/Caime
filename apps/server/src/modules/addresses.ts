/**
 * A person's own addresses and numbers (R91, `lib/addresses.ts`): the ones they added, a code to
 * prove one (by mail, by WhatsApp), the code back, and removing one.
 */
import { AddressAddBody, AddressVerifyBody } from '@caime/core';
import type { OkResponse, OwnAddressesResponse, OwnAddressResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  addAddress,
  addressesOf,
  phoneMethods,
  removeAddress,
  verifyAddress,
} from '../lib/addresses';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function addressRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = (req: { params: unknown }) =>
    parse(z.object({ id: z.string().uuid() }), req.params).id;

  app.get('/me/addresses', async (req): Promise<OwnAddressesResponse> => {
    const auth = requireAuth(req);
    return { addresses: await addressesOf(ctx, auth.userId), phoneBy: phoneMethods(ctx) };
  });

  app.post('/me/addresses', async (req, reply): Promise<OwnAddressResponse> => {
    const auth = requireAuth(req);
    const body = parse(AddressAddBody, req.body);
    // A code costs a message (WhatsApp's is paid): a few an hour is a person adding theirs.
    ctx.limiter.hit(`address-code:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const address = await addAddress(ctx, auth.userId, body.kind, body.value);
    reply.status(201);
    return { address };
  });

  app.post('/me/addresses/:id/verify', async (req): Promise<OwnAddressResponse> => {
    const auth = requireAuth(req);
    const { code } = parse(AddressVerifyBody, req.body);
    ctx.limiter.hit(`address-verify:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 600_000);
    return { address: await verifyAddress(ctx, auth.userId, idParam(req), code) };
  });

  app.delete('/me/addresses/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    await removeAddress(ctx, auth.userId, idParam(req));
    return { ok: true };
  });
}
