/**
 * The person behind an email address (R75, R91, R93): whoever on Caime it is (their sign-in, or an
 * address they proved theirs), else the provisional person made for it once, with a handle
 * nobody can type or find. Inbound mail, a meeting's guests and writing to an address all ask
 * here, so one address is one person everywhere and signing up with it claims all of it.
 */
import { defaultPrivacy, uuidv7 } from '@caime/core';
import { addressValue } from '@caime/core/addresses';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { USER_COLUMNS, type UserRow } from '../db/schema';
import { personByAddress } from './addresses';
import { ensureDirectConversation } from './conversations';
import { AppError, badRequest, conflict, forbidden } from './errors';
import { mailOn } from './mail-address';
import { isBlockedEitherWay, pairKey } from './relations';
import { minorOf } from './users';

/**
 * A guest by link (review 2026-10-17 §1 H6) is a provisional person of their own with no address:
 * a name a meeting's inviter gave, held under this reserved domain (RFC 2606: nothing is
 * delivered to it and nobody holds an address there), so nothing reaches them by mail and
 * nobody's address, or what others wrote to it, is ever behind a link someone else was handed.
 */
export const LINK_GUEST_DOMAIN = 'guest.invalid';
export const isLinkGuestAddress = (email: string | null | undefined) =>
  Boolean(email?.toLowerCase().endsWith(`@${LINK_GUEST_DOMAIN}`));

export async function personForAddress(
  ctx: AppContext,
  address: string,
  name: string,
): Promise<UserRow | null> {
  const email = address.toLowerCase();
  // Nobody is written to at a guest's reserved address: it's no one's to reach.
  if (isLinkGuestAddress(email)) return null;
  const byId = (id: string) =>
    ctx.db.selectFrom('users').select(USER_COLUMNS).where('id', '=', id).executeTakeFirst();
  const ownerId = await personByAddress(ctx.db, email);
  if (ownerId) return (await byId(ownerId)) ?? null;
  const find = () =>
    ctx.db.selectFrom('users').select(USER_COLUMNS).where('email', '=', email).executeTakeFirst();
  const known = await find();
  if (known) return known;
  const id = uuidv7();
  await ctx.db
    .insertInto('users')
    .values({
      id,
      email,
      // A handle nobody can type or find (a colon is never in one); claiming gives a real one.
      handle: `mail:${id}`,
      password_hash: '',
      display_name: name,
      kind: 'provisional',
      privacy: JSON.stringify(defaultPrivacy({ minor: false })),
      // Its own clock, as the sweep reads it (a test moves the clock).
      created_at: ctx.now(),
    })
    .onConflict((oc) => oc.column('email').doNothing())
    .execute();
  // Two asks for a new address at once: the first one's row is theirs.
  return (await find()) ?? null;
}

/** How many new addresses a person may start writing to in a day (R93): a person, not a list. */
export const NEW_ADDRESSES_A_DAY = 20;

/**
 * Opens the one-to-one with an email address that isn't on Caime (R93), for a person writing
 * from their own Caime address: the address's provisional person, as a message request, so one
 * message goes until they answer. An address that is someone's on Caime is refused as taken
 * (as sign-up says it), never mailed behind them and never named.
 */
export async function openMailConversation(
  ctx: AppContext,
  userId: string,
  raw: string,
  name: string | undefined,
): Promise<{ id: string; created: boolean }> {
  if (!ctx.mailProvider || !mailOn(ctx.config))
    throw new AppError(503, 'email_unavailable', tr('Caime can’t send email here yet.'));
  const address = addressValue('email', raw);
  if (!address) throw badRequest(tr('That doesn’t look like an email address.'));
  if (address.endsWith(`@${ctx.config.MAIL_DOMAIN?.toLowerCase()}`))
    throw badRequest(tr('That’s a Caime address. Find them by their handle.'));
  const me = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (minorOf(me, ctx.now()))
    throw forbidden(tr('Writing to an address by email is for people over 18.'));
  const holder = await personByAddress(ctx.db, address);
  if (holder === userId) throw badRequest(tr('That’s your own address.'));
  // Someone's on Caime is never written to behind them (R93), and the answer names nobody and
  // says nothing of how they may be found: the same words for anyone's address.
  const taken = () =>
    conflict(
      'email_taken',
      tr(
        'That address can’t be written to by email from here. If they’re on Caime, find them there.',
      ),
    );
  // Every new address counts against the day before anything is said of it, so asking can't
  // list who is on Caime (review 2026-10-17 §2 H2); writing again to one already started doesn't.
  const known = await ctx.db
    .selectFrom('users')
    .select('id')
    .where('email', '=', address)
    .where('kind', '=', 'provisional')
    .executeTakeFirst();
  const already =
    known &&
    (await ctx.db
      .selectFrom('conversations')
      .select('id')
      .where('direct_key', '=', pairKey(userId, known.id).key)
      .where('is_general', '=', true)
      .executeTakeFirst());
  if (!already)
    ctx.limiter.hit(
      `mail-start:${userId}`,
      ctx.config.isTest ? 1000 : NEW_ADDRESSES_A_DAY,
      86_400_000,
    );
  if (holder) throw taken();
  const person = await personForAddress(ctx, address, name?.trim() || address);
  // Someone signed up with it, or proved it theirs, a moment ago.
  if (person?.kind !== 'provisional') throw taken();
  if (await isBlockedEitherWay(ctx.db, userId, person.id))
    throw forbidden(tr('You can’t message this person.'));
  return ensureDirectConversation(ctx.db, userId, person.id, {
    createdBy: userId,
    requestFrom: userId,
  });
}
