/**
 * Contacts from wherever someone keeps them (R89): a phone's own address book, the browser's
 * contact picker, a Google or a Microsoft account, or a file (`contacts.ts`). Each source is
 * read on the person's device and comes out the same, a list of names, addresses and numbers,
 * from which only the addresses go to the server, to say who's on Caime. Whoever isn't is
 * invited by the person, one at a time, through their own WhatsApp, messages or mail
 * (`contact-invites.ts`): Caime never writes to anyone on anyone's behalf.
 *
 * Pure: no zod, no platform APIs, so the app takes it by subpath.
 */
import type { ContactAccount, ContactSource } from './contact-return';
import { CONTACTS_MAX, type Contact, cleanEmail, cleanPhone } from './contacts';

export * from './contact-return';

/**
 * What each account is asked for, read-only: Google's contacts and its "other contacts" (the
 * people someone has written to), Microsoft's contacts and the people someone works with. The
 * server asks for these in its consent link; the device reads the pages.
 */
export const CONTACT_ACCOUNT_SCOPES: Readonly<Record<ContactAccount, readonly string[]>> = {
  google: [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/contacts.other.readonly',
  ],
  microsoft: [
    'https://graph.microsoft.com/Contacts.Read',
    'https://graph.microsoft.com/People.Read',
  ],
};

/** The first page of each list an account is read from, on its API's address. */
export const CONTACT_ACCOUNT_LISTS: Readonly<Record<ContactAccount, readonly string[]>> = {
  google: [
    '/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=1000',
    '/v1/otherContacts?readMask=names,emailAddresses,phoneNumbers&pageSize=1000',
  ],
  microsoft: [
    '/v1.0/me/contacts?$select=displayName,emailAddresses,mobilePhone,homePhones,businessPhones&$top=999',
    '/v1.0/me/people?$select=displayName,scoredEmailAddresses,phones&$top=1000',
  ],
};

/** A contact as a source gives it, before it's cleaned. */
export interface RawContact {
  name?: string | null;
  emails?: readonly string[];
  phones?: readonly string[];
}

/** What a source came to: the people in it, cleaned and once each, and how many it held. */
export interface ContactList {
  source: ContactSource;
  contacts: Contact[];
  read: number;
}

type Json = Record<string, unknown>;
const list = (v: unknown): Json[] =>
  Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object') : [];
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const texts = (vs: unknown[]): string[] => vs.map(text).filter((v): v is string => v !== null);

/**
 * Raw contacts into one list: each cleaned, the empty ones dropped, and two that share an
 * address or a number made one (a person in a phone's book and in an account alike), up to
 * `CONTACTS_MAX`.
 */
export function contactListOf(source: ContactSource, raws: Iterable<RawContact>): ContactList {
  const contacts: Contact[] = [];
  const byKey = new Map<string, Contact>();
  let read = 0;
  for (const raw of raws) {
    read++;
    const emails = [...new Set((raw.emails ?? []).map(cleanEmail).filter((e): e is string => !!e))];
    const phones = [...new Set((raw.phones ?? []).map(cleanPhone).filter((p): p is string => !!p))];
    const name = text(raw.name);
    if (!name && !emails.length && !phones.length) continue;
    const keys = [...emails.map((e) => `e:${e}`), ...phones.map((p) => `p:${p}`)];
    const same = keys.map((k) => byKey.get(k)).find(Boolean);
    if (same) {
      same.name ??= name;
      for (const e of emails) if (!same.emails.includes(e)) same.emails.push(e);
      for (const p of phones) if (!same.phones.includes(p)) same.phones.push(p);
      for (const k of keys) byKey.set(k, same);
      continue;
    }
    if (contacts.length >= CONTACTS_MAX) continue;
    const c: Contact = { name, emails, phones };
    contacts.push(c);
    for (const k of keys) byKey.set(k, c);
  }
  return { source, contacts, read };
}

/** Google's People API page (`connections` or `otherContacts`) as raw contacts. */
export function fromGooglePeople(page: unknown): RawContact[] {
  const p = (page ?? {}) as Json;
  return [...list(p.connections), ...list(p.otherContacts)].map((person) => ({
    name: text(list(person.names)[0]?.displayName),
    emails: texts(list(person.emailAddresses).map((e) => e.value)),
    phones: texts(list(person.phoneNumbers).map((n) => text(n.canonicalForm) ?? n.value)),
  }));
}

/** Microsoft Graph's contacts (`/me/contacts`) or people (`/me/people`) as raw contacts. */
export function fromMicrosoftGraph(page: unknown): RawContact[] {
  const p = (page ?? {}) as Json;
  return list(p.value).map((c) => ({
    name: text(c.displayName),
    emails: texts([
      ...list(c.emailAddresses).map((e) => e.address),
      ...list(c.scoredEmailAddresses).map((e) => e.address),
    ]),
    phones: texts([
      c.mobilePhone,
      ...(Array.isArray(c.homePhones) ? c.homePhones : []),
      ...(Array.isArray(c.businessPhones) ? c.businessPhones : []),
      ...list(c.phones).map((n) => n.number),
    ]),
  }));
}

/** Where an account's next page is, or null at the last. */
export function nextAccountPage(
  account: ContactAccount,
  page: unknown,
  first: string,
): string | null {
  const p = (page ?? {}) as Json;
  if (account === 'microsoft') {
    const next = text(p['@odata.nextLink']);
    // Graph names its next page whole; only its path and query are kept, on the same API.
    return next ? next.replace(/^https?:\/\/[^/]+/, '') : null;
  }
  const token = text(p.nextPageToken);
  return token ? `${first}&pageToken=${encodeURIComponent(token)}` : null;
}

/** The pages an account is read from, at most, each list: `CONTACTS_MAX` in pages of a thousand. */
const PAGES_MAX = 6;

/** Enough of `fetch` to read an account: the device's own, or a test's. */
export type AccountFetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** An account that refused the access outright (401), or failed (5xx): its status. */
export class AccountReadFailed extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** What reading an account came to: its contacts, and how many of its lists it let be read. */
export interface AccountRead {
  raws: RawContact[];
  /** Lists read, and lists refused (a scope the person left unticked, or none of theirs). */
  read: number;
  refused: number;
}

/**
 * Reads an account's lists with the access it gave, on the device: each list page by page up to
 * `CONTACTS_MAX` contacts, a list it refuses (403 or 404) left out. Throws when the access was
 * refused outright (401), or the provider failed.
 */
export async function readAccount(
  account: ContactAccount,
  api: string,
  access: string,
  get: AccountFetch,
  onPage?: (contactsSoFar: number) => void,
): Promise<AccountRead> {
  const base = api.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${access}`, Accept: 'application/json' };
  const raws: RawContact[] = [];
  let read = 0;
  let refused = 0;
  for (const first of CONTACT_ACCOUNT_LISTS[account]) {
    let path: string | null = first;
    let fromList = 0;
    for (let page = 0; path && page < PAGES_MAX && fromList < CONTACTS_MAX; page++) {
      const res = await get(`${base}${path}`, { headers });
      if (res.status === 403 || res.status === 404) {
        refused++;
        path = null;
        fromList = -1;
        break;
      }
      if (!res.ok) throw new AccountReadFailed(res.status);
      const body = await res.json();
      const people = account === 'google' ? fromGooglePeople(body) : fromMicrosoftGraph(body);
      raws.push(...people);
      fromList += people.length;
      onPage?.(raws.length);
      path = nextAccountPage(account, body, first);
    }
    if (fromList >= 0) read++;
  }
  return { raws, read, refused };
}

/** What the browser's contact picker gives (`navigator.contacts.select`). */
export function fromPicked(picked: unknown): RawContact[] {
  return list(picked).map((c) => ({
    name: Array.isArray(c.name) ? (c.name.map(text).find(Boolean) ?? null) : null,
    emails: Array.isArray(c.email) ? texts(c.email) : [],
    phones: Array.isArray(c.tel) ? texts(c.tel) : [],
  }));
}

/** What a phone's address book gives (expo-contacts' `Contact.getAllDetails`). */
export function fromDevice(people: unknown): RawContact[] {
  return list(people).map((c) => ({
    name:
      text(c.fullName) ??
      ([text(c.givenName), text(c.familyName)].filter(Boolean).join(' ') || null),
    emails: texts(list(c.emails).map((e) => e.address)),
    phones: texts(list(c.phones).map((n) => n.number)),
  }));
}
