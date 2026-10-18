/**
 * Writing before an account (R97 (1), M16 C1d): a visitor on an organization's page, or arriving
 * by its door (`/o/<handle>?write`, the link and the QR at the front desk), gives a name, an
 * address and the message, proves the address with the six-digit code, and the message lands in
 * the organization's Business inbox as their provisional self's (R93), as any customer's first
 * message does: the team is told, its agent may answer. The answer reaches them by mail where
 * Caime Mail is on (the team's words go out from the organization's address, and a reply to that
 * mail comes back into the same conversation), and the page says so; without it, the page says
 * that joining with the address shows the answer. Signing up with the address claims all of it.
 * The shape is booking's (`public-booking.ts`): a page state, a form, a redirect, a sealed claim;
 * nothing is posted until the code comes back.
 */
import { minorMayWriteToOrg } from '@caime/core';
import { addressValue } from '@caime/core/addresses';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { startCustomerConversation } from './business-threads';
import { sendEmailCode, spendEmailCode } from './email-codes';
import { AppError } from './errors';
import { afterMessage } from './message-effects';
import { sendMessage } from './messages';
import { personForAddress } from './provisional';
import { CLAIM_MS } from './public-booking';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

/** How long a message from the page may be: a first word, not a letter (more follows by mail). */
export const WRITE_MAX = 1000;

const LABEL = 'caime public write v1';
const claimKey = (ctx: AppContext) => serverKey(ctx, 'public.write');

/** What a visitor wrote, sealed between the two steps; `e` is when it runs out (ms). */
export interface WriteClaim {
  v: 1;
  orgId: string;
  personId: string;
  name: string;
  email: string;
  body: string;
  /** They said they're 18 or over (asked only where the organization hasn't proved who it is). */
  adult: boolean;
  e: number;
}

/** Why a visitor's message stopped, said on the page in its words. */
export type WriteRefusal =
  | 'account'
  | 'no_mail'
  | 'not_open'
  | 'message'
  | 'expired'
  | 'wrong_code'
  | 'code_expired'
  | 'too_many'
  | 'adult';

export const WRITE_REFUSALS: readonly WriteRefusal[] = [
  'account',
  'no_mail',
  'not_open',
  'message',
  'expired',
  'wrong_code',
  'code_expired',
  'too_many',
  'adult',
];

/** A message as the form sent it: one kind of line break, no space around it. */
export const writtenBody = (raw: string) => raw.replace(/\r\n?/g, '\n').trim();

/**
 * Under 18, a person writes only to an organization that has proved who it is (R29,
 * `minorMayWriteToOrg`): so the page asks "I'm 18 or over" only of an unverified one.
 */
export const asksAge = (org: { verified: boolean }) => !org.verified;
const verifiedOf = (org: Pick<Organization, 'verified_at'>) => ({
  verified: org.verified_at !== null,
});

/** Whether the organization's answer reaches the visitor by mail (Caime Mail's mail out). */
export const repliesByMail = (ctx: AppContext) =>
  Boolean(ctx.mailProvider && ctx.config.MAIL_DOMAIN);

/** The client id of the message a claim stands for: twice is once. */
export const writeClientId = (claim: Pick<WriteClaim, 'personId' | 'e'>) =>
  `public-write:${claim.personId}:${claim.e}`;

export async function sealWriteClaim(ctx: AppContext, claim: WriteClaim): Promise<string> {
  return seal(await claimKey(ctx), Buffer.from(JSON.stringify(claim)), LABEL).toString('base64url');
}

/** The claim a page or a form carries, or null for anything changed, run out or not ours. */
export async function openWriteClaim(ctx: AppContext, token: string): Promise<WriteClaim | null> {
  if (!/^[A-Za-z0-9_-]{32,8192}$/.test(token)) return null;
  const plain = unseal(await claimKey(ctx), Buffer.from(token, 'base64url'), LABEL);
  if (!plain) return null;
  try {
    const claim = JSON.parse(plain.toString()) as WriteClaim;
    if (claim.v !== 1 || typeof claim.e !== 'number' || claim.e <= ctx.now().getTime()) return null;
    return claim;
  } catch {
    return null;
  }
}

export type WriteStart =
  | { kind: 'code'; claim: string }
  | { kind: 'refused'; reason: WriteRefusal };

/**
 * Step one: the words checked, the age where it's asked, the address resolved to a person
 * (someone's account is sent to sign in, never mailed behind them), the code sent, the claim
 * sealed with the message in it.
 */
export async function startVisitorWrite(
  ctx: AppContext,
  org: Organization,
  ask: { name: string; email: string; body: string; adult: boolean },
): Promise<WriteStart> {
  const body = writtenBody(ask.body);
  if (!body || body.length > WRITE_MAX) return { kind: 'refused', reason: 'message' };
  if (!minorMayWriteToOrg(!ask.adult, !asksAge(verifiedOf(org))))
    return { kind: 'refused', reason: 'adult' };
  const email = addressValue('email', ask.email);
  if (!email) return { kind: 'refused', reason: 'not_open' };
  if (!ctx.mail) return { kind: 'refused', reason: 'no_mail' };
  const name = ask.name.trim().slice(0, 80) || email;
  const person = await personForAddress(ctx, email, name);
  if (!person) return { kind: 'refused', reason: 'not_open' };
  if (person.kind !== 'provisional') return { kind: 'refused', reason: 'account' };
  // Their name as they wrote it this time (a provisional person has no other say).
  if (person.display_name !== name)
    await ctx.db
      .updateTable('users')
      .set({ display_name: name })
      .where('id', '=', person.id)
      .execute();
  await sendEmailCode(ctx, person.id, email, name, 'visitor');
  const claim: WriteClaim = {
    v: 1,
    orgId: org.id,
    personId: person.id,
    name,
    email,
    body,
    adult: ask.adult,
    e: ctx.now().getTime() + CLAIM_MS,
  };
  return { kind: 'code', claim: await sealWriteClaim(ctx, claim) };
}

export type WriteDone =
  | { kind: 'written'; conversationId: string; messageId: string }
  | { kind: 'refused'; reason: WriteRefusal };

/**
 * Step two: the code spent, the customer conversation started (or found), the message posted as
 * the provisional person, exactly as a customer's own first message is, its effects run (the
 * team told, the agent asked). A claim posted again after it went is answered as written, without
 * a second code or a second message.
 */
export async function confirmVisitorWrite(
  ctx: AppContext,
  org: Organization,
  claim: WriteClaim,
  code: string,
): Promise<WriteDone> {
  if (claim.orgId !== org.id) return { kind: 'refused', reason: 'expired' };
  const clientId = writeClientId(claim);
  const already = await ctx.db
    .selectFrom('messages')
    .select(['id', 'conversation_id'])
    .where('sender_id', '=', claim.personId)
    .where('client_id', '=', clientId)
    .executeTakeFirst();
  if (already)
    return { kind: 'written', conversationId: already.conversation_id, messageId: already.id };
  try {
    await spendEmailCode(ctx, claim.personId, code);
  } catch (err) {
    if (err instanceof AppError && (err.code === 'wrong_code' || err.code === 'code_expired'))
      return { kind: 'refused', reason: err.code };
    throw err;
  }
  const person = await ctx.db
    .selectFrom('users')
    .select(['id', 'kind', 'birth_date', 'time_zone'])
    .where('id', '=', claim.personId)
    .executeTakeFirst();
  // Someone who joined with the address meanwhile writes from their account.
  if (person?.kind !== 'provisional') return { kind: 'refused', reason: 'account' };
  if (!minorMayWriteToOrg(!claim.adult, !asksAge(verifiedOf(org))))
    return { kind: 'refused', reason: 'adult' };
  try {
    const { conversationId } = await startCustomerConversation(ctx, person, org, null);
    const sent = await sendMessage(ctx, person.id, conversationId, {
      clientId,
      kind: 'text',
      body: claim.body,
    });
    if (sent.created) {
      const { message, analysis } = sent;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
    return { kind: 'written', conversationId, messageId: sent.message.id };
  } catch (err) {
    // The organization closed, or anything else a customer's message would meet.
    if (err instanceof AppError && err.status < 500) return { kind: 'refused', reason: 'not_open' };
    throw err;
  }
}

/** What an organization's page shows of writing without an account: the step, from its query. */
export type VisitorWriteState =
  | {
      step: 'write';
      /** Whether the form leads the page: they came by the door, or back from a step. */
      lead: boolean;
      asksAge: boolean;
      repliesByMail: boolean;
      /** What they wrote before, when they go back to change it or a code ran out. */
      prefill: { name: string; email: string; body: string } | null;
      error: WriteRefusal | null;
    }
  | { step: 'code'; claim: string; email: string; error: WriteRefusal | null }
  | { step: 'written'; email: string; repliesByMail: boolean };

/**
 * The step the page is at (`?write`, `?write-code=`, `?write-again=`, `?written=`,
 * `?write-error=`), or null without a mailer: nothing would prove the address, so the page
 * offers joining alone, never a form that could only end in "not available here".
 */
export async function visitorWriteState(
  ctx: AppContext,
  org: { id: string; verified: boolean },
  search: URLSearchParams,
): Promise<VisitorWriteState | null> {
  if (!ctx.mail) return null;
  const ours = (claim: WriteClaim | null): claim is WriteClaim =>
    Boolean(claim && claim.orgId === org.id);
  const raw = search.get('write-error');
  const error =
    raw && (WRITE_REFUSALS as readonly string[]).includes(raw) ? (raw as WriteRefusal) : null;
  const byMail = repliesByMail(ctx);
  const written = search.get('written');
  if (written) {
    const claim = await openWriteClaim(ctx, written);
    if (ours(claim)) return { step: 'written', email: claim.email, repliesByMail: byMail };
  }
  const code = search.get('write-code');
  if (code) {
    const claim = await openWriteClaim(ctx, code);
    if (ours(claim)) return { step: 'code', claim: code, email: claim.email, error };
  }
  const again = search.get('write-again');
  const before = again ? await openWriteClaim(ctx, again) : null;
  return {
    step: 'write',
    lead: Boolean(search.has('write') || written || code || again || error),
    asksAge: asksAge(org),
    repliesByMail: byMail,
    prefill: ours(before) ? { name: before.name, email: before.email, body: before.body } : null,
    // A message already sent says nothing more once its claim runs out; a code's step that ran
    // out says so, and what they wrote comes back only while its claim holds.
    error: code ? 'expired' : again && !ours(before) ? 'expired' : error,
  };
}
