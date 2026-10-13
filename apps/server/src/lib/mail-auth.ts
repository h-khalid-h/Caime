/**
 * Who sent a mail in, as Caime can prove it (R75; review 2026-10-13). The provider's payload
 * carries no verdict Caime can trust: Postmark writes no `Authentication-Results` into it, and a
 * sender's own headers come through untouched, so a header there saying "dmarc=pass" is whatever
 * the sender wrote. Caime checks the raw message itself: every DKIM signature against its key in
 * DNS, SPF for the address that connected to the provider's receiving server, and DMARC from both
 * (mailauth, pinned). The connecting address is read only from the `Received` lines the
 * provider's own servers wrote at the top (`receivingHop`); otherwise there is no SPF result,
 * and DKIM alone can vouch. Without the raw message nothing is vouched for.
 */
import { isIP } from 'node:net';
// The three checks alone, never mailauth's root: it loads BIMI, whose undici replaces the
// dispatcher every fetch in the server goes through (a dependency must not change that).
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import { evaluateDmarc } from 'mailauth/lib/dmarc/index.js';
import { spf } from 'mailauth/lib/spf/index.js';
import type { AppContext } from '../context';
import { isPrivateAddress } from './apps';
import type { AuthResult, MailAuth } from './mail-provider';

export const NO_AUTH: MailAuth = { spf: null, dkim: [], dmarc: null };

/** The header block of a raw message, its folded lines joined. */
function headerLines(raw: string): string[] {
  const end = raw.search(/\r?\n\r?\n/);
  const block = end < 0 ? raw : raw.slice(0, end);
  return block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
}

/**
 * Who connected to the provider's receiving servers from the internet: the `Received` lines from
 * the top, each written by one of the provider's hosts (`receivingHosts`) and read as
 * `from <helo> (… [<ip>]) by <host> …`, past any hop between its own servers (a private
 * address, which nobody on the internet connects from), to the first public address. A line
 * the provider didn't write, before that, is null: a sender writes their own lines below its.
 */
export function receivingHop(
  raw: string,
  receivingHosts: RegExp,
): { ip: string; helo: string | null } | null {
  for (const line of headerLines(raw).filter((l) => /^received:/i.test(l))) {
    const value = line.slice(line.indexOf(':') + 1);
    const by = /\sby\s+([^\s;()]+)/i.exec(value)?.[1]?.toLowerCase().replace(/\.$/, '');
    if (!by || !receivingHosts.test(by)) return null;
    // The from clause, up to " by ": its TCP-info comment carries the address in brackets.
    const fromClause = value.slice(0, value.search(/\sby\s/i));
    const ip = /\[(?:ipv6:)?([0-9a-f:.]+)\]/i.exec(fromClause)?.[1];
    if (!ip || !isIP(ip)) return null;
    if (isPrivateAddress(ip)) continue;
    const helo = /^\s*from\s+([^\s(;]+)/i.exec(fromClause)?.[1] ?? null;
    return { ip, helo };
  }
  return null;
}

/**
 * Whose SPF to check: the envelope sender as recorded (`Return-Path`), else the From address.
 * Either may be the sender's own words, which is harmless here: SPF asks whether the address the
 * provider saw connect may send for that domain, and that address is never the sender's to say.
 */
function spfIdentity(raw: string): string | undefined {
  const lines = headerLines(raw);
  const addressIn = (name: RegExp) => {
    const line = lines.find((l) => name.test(l));
    if (!line) return null;
    const value = line.slice(line.indexOf(':') + 1);
    return (
      (/<([^<>\s]+@[^<>\s]+)>/.exec(value)?.[1] ?? /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(value)?.[1]) ||
      null
    );
  };
  return addressIn(/^return-path:/i) ?? addressIn(/^from:/i) ?? undefined;
}

const asResult = (word: unknown): AuthResult => {
  const w = String(word ?? '').toLowerCase();
  if (w === 'pass') return 'pass';
  if (w === 'fail' || w === 'softfail') return 'fail';
  return !w || w === 'none' ? 'none' : 'other';
};

/** DNS for mailauth, through Caime's own resolver (tests and E2E stand in for the internet). */
function resolverOf(ctx: AppContext) {
  return async (name: string, rrtype: string): Promise<string[][] | string[]> => {
    if (rrtype === 'TXT') return ctx.dns.resolveTxt(name);
    if (ctx.dns.resolve) return ctx.dns.resolve(name, rrtype);
    throw Object.assign(new Error(`No ${rrtype} lookups here`), { code: 'ENOTFOUND' });
  };
}

/**
 * The raw message's authentication, as Caime checked it. Never throws: a message that can't be
 * read, or a lookup that fails, is simply not vouched for.
 */
export async function authenticateMail(
  ctx: AppContext,
  raw: string | null,
  receivingHosts: RegExp,
): Promise<MailAuth> {
  if (!raw) return NO_AUTH;
  const hop = receivingHop(raw, receivingHosts);
  const resolver = resolverOf(ctx);
  try {
    // What mailauth's `authenticate` runs, less ARC and BIMI, which Caime never reads.
    const dkim = await dkimVerify(Buffer.from(raw, 'utf8'), { resolver });
    // SPF only for the address the provider's own server saw connect.
    const spfResult = hop
      ? await spf({
          ip: hop.ip,
          helo: hop.helo && !isIP(hop.helo) ? hop.helo : `[${hop.ip}]`,
          sender: spfIdentity(raw),
          mta: ctx.config.MAIL_DOMAIN ?? 'caime',
          resolver,
        })
      : null;
    const passed = (dkim.results ?? []).flatMap((r) =>
      r.status?.result === 'pass' && r.signingDomain ? [{ ...r, domain: r.signingDomain }] : [],
    );
    const dmarc = dkim.headerFrom
      ? (
          await evaluateDmarc({
            headerFrom: dkim.headerFrom,
            fromFields: dkim.fromFields,
            spfDomains:
              spfResult?.status?.result === 'pass' && spfResult.domain ? [spfResult.domain] : [],
            dkimDomains: passed.map((r) => ({
              id: r.id,
              domain: r.domain,
              aligned: r.status?.aligned,
              underSized: r.status?.underSized,
            })),
            resolver,
          })
        ).response
      : false;
    return {
      spf: spfResult
        ? { result: asResult(spfResult.status?.result), domain: spfResult.domain ?? null }
        : null,
      // A signature that covers only part of the body (its `l=` tag), with bytes after it,
      // vouches for nothing: anyone could have written those, and they'd be the message.
      dkim: (dkim.results ?? []).map((r) => ({
        result: r.status?.underSized ? 'other' : asResult(r.status?.result),
        domain: r.signingDomain ?? null,
      })),
      // So DMARC passes only when SPF aligned, or an aligned signature covers the whole body.
      dmarc: dmarc
        ? {
            result:
              dmarc.alignment?.dkim?.underSized && !dmarc.alignment.spf?.result
                ? 'other'
                : asResult(dmarc.status?.result),
            domain: dmarc.domain ?? null,
          }
        : null,
    };
  } catch (err) {
    ctx.log.warn({ err }, 'mail in: authentication could not be checked');
    return NO_AUTH;
  }
}
