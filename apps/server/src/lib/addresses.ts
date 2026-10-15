/**
 * What is someone, beyond their sign-in (R91): email addresses and phone numbers they add as
 * theirs, each proven by a six-digit code sent to it (an email by mail, a phone by WhatsApp),
 * kept hashed, ten minutes, five tries, counted in the database. Proven, it's that person's
 * alone (a unique index), and it counts: mail from it is from them (`personByAddress`), and
 * people who have it find them by it, as their sign-in email (`findableByEmail`). Unproven, it
 * counts for nothing.
 */
import { randomInt, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from '@caime/core';
import {
  ADDRESS_CODE_MINUTES,
  ADDRESS_CODE_TRIES,
  ADDRESSES_MAX,
  type AddressKind,
  type AddressMethod,
  addressValue,
} from '@caime/core/addresses';
import type { OwnAddressView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { Kysely } from 'kysely';
import type { AppContext } from '../context';
import type { Database, OwnAddressesTable } from '../db/schema';
import { hashToken } from './crypto';
import { AppError, badRequest, conflict, mailUnavailable, notFound } from './errors';
import { whatsappFor } from './whatsapp';

type Row = Pick<OwnAddressesTable, 'id' | 'kind' | 'value' | 'method' | 'verified_at'> & {
  created_at: Date;
};

const COLUMNS = ['id', 'kind', 'value', 'method', 'verified_at', 'created_at'] as const;

export function addressView(r: Row): OwnAddressView {
  return {
    id: r.id,
    kind: r.kind,
    value: r.value,
    verified: r.verified_at !== null,
    method: r.method,
    verifiedAt: r.verified_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}

/** How a phone number can be proven here: WhatsApp when its sender is set up. */
export function phoneMethods(ctx: Pick<AppContext, 'config'>): AddressMethod[] {
  return whatsappFor(ctx.config) ? ['whatsapp'] : [];
}

export async function addressesOf(ctx: AppContext, userId: string): Promise<OwnAddressView[]> {
  const rows = await ctx.db
    .selectFrom('own_addresses')
    .select(COLUMNS)
    .where('user_id', '=', userId)
    .orderBy('created_at')
    .execute();
  return rows.map(addressView);
}

const taken = (kind: AddressKind) =>
  kind === 'email'
    ? conflict('email_taken', tr('That email belongs to someone else on Caime.'))
    : conflict('phone_taken', tr('That number belongs to someone else on Caime.'));

/** Who on Caime an address is: someone's sign-in email, or a proven one of theirs. */
async function holderOf(
  db: Kysely<Database>,
  kind: AddressKind,
  value: string,
): Promise<string | null> {
  if (kind === 'email') {
    const user = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', value)
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (user) return user.id;
  }
  const proven = await db
    .selectFrom('own_addresses')
    .select('user_id')
    .where('kind', '=', kind)
    .where('value', '=', value)
    .where('verified_at', 'is not', null)
    .executeTakeFirst();
  return proven?.user_id ?? null;
}

/** Sends a new code to the identity (a new one replaces the last), by mail or by WhatsApp. */
async function sendCode(ctx: AppContext, id: string, kind: AddressKind, value: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sender = kind === 'phone' ? whatsappFor(ctx.config) : null;
  if (kind === 'email' && !ctx.mail) throw mailUnavailable();
  if (kind === 'phone' && !sender)
    throw new AppError(
      503,
      'phone_unavailable',
      tr('Phone numbers can’t be proven here yet. Try again later.'),
    );
  await ctx.db
    .updateTable('own_addresses')
    .set({
      code_hash: hashToken(code),
      code_attempts: 0,
      code_expires_at: new Date(ctx.now().getTime() + ADDRESS_CODE_MINUTES * 60_000),
    })
    .where('id', '=', id)
    .execute();
  if (kind === 'email') {
    const mail = ctx.mail;
    // After the response, never through the job queue: the code is a secret (R48).
    ctx.defer('address.code', async () => {
      await mail?.send({
        to: value,
        kind: 'address',
        subject: `Your Caime code: ${code}`,
        text: `Your code to add this address to Caime is ${code}.\n\nIt works for ${ADDRESS_CODE_MINUTES} minutes. If you didn't ask for it, ignore this mail: nothing changes.\n`,
      });
    });
    return;
  }
  try {
    await sender?.sendCode(value, code);
  } catch (err) {
    ctx.log.warn({ err: (err as Error).message }, 'addresses: the code was not sent');
    throw new AppError(
      502,
      'provider_failed',
      tr('{name} didn’t answer. Try again in a moment.', { name: 'WhatsApp' }),
    );
  }
}

/**
 * Adds an email or a phone number as the person's, or sends a new code to one they added and
 * haven't proven. One that someone else has proven, or that is someone's sign-in email, is
 * refused at once: a code to it would prove nothing anyone could use.
 */
export async function addAddress(
  ctx: AppContext,
  userId: string,
  kind: AddressKind,
  raw: string,
): Promise<OwnAddressView> {
  const value = addressValue(kind, raw);
  if (!value)
    throw badRequest(
      kind === 'email'
        ? tr('That doesn’t look like an email address.')
        : tr('Write the number with its country code, like +20 101 234 5678.'),
    );
  const holder = await holderOf(ctx.db, kind, value);
  if (holder === userId)
    throw conflict(kind === 'email' ? 'email_taken' : 'phone_taken', tr('That’s already yours.'));
  if (holder) throw taken(kind);
  const count = await ctx.db
    .selectFrom('own_addresses')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .executeTakeFirstOrThrow();
  const existing = await ctx.db
    .selectFrom('own_addresses')
    .select(COLUMNS)
    .where('user_id', '=', userId)
    .where('kind', '=', kind)
    .where('value', '=', value)
    .executeTakeFirst();
  if (!existing && Number(count.n) >= ADDRESSES_MAX)
    throw badRequest(tr('That’s as many as one person can add. Remove one first.'));
  const row =
    existing ??
    (await ctx.db
      .insertInto('own_addresses')
      .values({ id: uuidv7(), user_id: userId, kind, value, created_at: ctx.now() })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow());
  await sendCode(ctx, row.id, kind, value);
  return addressView(row);
}

/** Proves an identity with its code; proven, it's the person's alone. */
export async function verifyAddress(
  ctx: AppContext,
  userId: string,
  id: string,
  code: string,
): Promise<OwnAddressView> {
  const row = await ctx.db
    .selectFrom('own_addresses')
    .select([...COLUMNS, 'code_hash', 'code_attempts', 'code_expires_at'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row) throw notFound(tr('That address'));
  if (row.verified_at) return addressView(row);
  if (!row.code_hash || !row.code_expires_at || row.code_expires_at <= ctx.now())
    throw new AppError(400, 'code_expired', tr('That code has run out. Send a new one.'));
  if (row.code_attempts >= ADDRESS_CODE_TRIES)
    throw new AppError(400, 'code_expired', tr('Too many tries with that code. Send a new one.'));
  if (!timingSafeEqual(row.code_hash, hashToken(code))) {
    // Counted in the database: a burst of guesses at once each adds one.
    await ctx.db
      .updateTable('own_addresses')
      .set((eb) => ({ code_attempts: eb('code_attempts', '+', 1) }))
      .where('id', '=', id)
      .execute();
    throw new AppError(400, 'wrong_code', tr('That code isn’t right. Check it and try again.'));
  }
  // Someone may have proven it, or signed up with it, since the code was sent.
  const holder = await holderOf(ctx.db, row.kind, row.value);
  if (holder && holder !== userId) throw taken(row.kind);
  try {
    const done = await ctx.db
      .updateTable('own_addresses')
      .set({
        verified_at: ctx.now(),
        method: row.kind === 'email' ? 'email' : 'whatsapp',
        code_hash: null,
        code_expires_at: null,
        code_attempts: 0,
      })
      .where('id', '=', id)
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
    return addressView(done);
  } catch (err) {
    // Two people proving the same number at once: the unique index lets one through.
    if ((err as { code?: string }).code === '23505') throw taken(row.kind);
    throw err;
  }
}

export async function removeAddress(ctx: AppContext, userId: string, id: string): Promise<void> {
  const gone = await ctx.db
    .deleteFrom('own_addresses')
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!gone.numDeletedRows) throw notFound(tr('That address'));
}

/** The person an email address is: their sign-in, else one they proved (R91). */
export async function personByAddress(db: Kysely<Database>, email: string): Promise<string | null> {
  return holderOf(db, 'email', email.toLowerCase());
}

/** Of these addresses, who each proven one belongs to (for finding people by their email). */
export async function provenEmailHolders(
  db: Kysely<Database>,
  emails: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!emails.length) return out;
  const rows = await db
    .selectFrom('own_addresses')
    .select(['value', 'user_id'])
    .where('kind', '=', 'email')
    .where('value', 'in', emails)
    .where('verified_at', 'is not', null)
    .execute();
  for (const r of rows) out.set(r.value, r.user_id);
  return out;
}
