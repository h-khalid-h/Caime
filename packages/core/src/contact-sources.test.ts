import { describe, expect, it } from 'vitest';
import { inviteWays, toInternational } from './contact-invites';
import { newContactKey, openContactAccess, sealContactAccess } from './contact-seal';
import {
  type AccountFetch,
  AccountReadFailed,
  CONTACT_ACCOUNT_LISTS,
  contactListOf,
  contactReturnFragment,
  contactReturnOf,
  fromDevice,
  fromGooglePeople,
  fromMicrosoftGraph,
  fromPicked,
  nextAccountPage,
  readAccount,
} from './contact-sources';
import { CONTACTS_MAX } from './contacts';

describe('contactListOf', () => {
  it('cleans each contact and makes one of two that share an address or a number', () => {
    const list = contactListOf('device', [
      { name: ' Sara Haddad ', emails: ['Sara@Example.com'], phones: ['+961 3 123 456'] },
      { name: null, emails: ['sara@example.com', 'not an address'], phones: [] },
      { name: 'Karim', emails: [], phones: ['(03) 999-888'] },
      { name: null, emails: [], phones: ['12'] },
      { name: 'Karim N.', emails: ['karim@example.com'], phones: ['03 999 888'] },
    ]);
    expect(list.read).toBe(5);
    expect(list.contacts).toEqual([
      { name: 'Sara Haddad', emails: ['sara@example.com'], phones: ['+9613123456'] },
      { name: 'Karim', emails: ['karim@example.com'], phones: ['03999888'] },
    ]);
  });

  it('stops at CONTACTS_MAX people however many the source holds', () => {
    const raws = Array.from({ length: CONTACTS_MAX + 20 }, (_, i) => ({
      name: `P${i}`,
      emails: [`p${i}@example.com`],
    }));
    const list = contactListOf('google', raws);
    expect(list.contacts).toHaveLength(CONTACTS_MAX);
    expect(list.read).toBe(CONTACTS_MAX + 20);
  });
});

describe('each source as contacts', () => {
  it("reads Google's connections and other contacts", () => {
    const raws = fromGooglePeople({
      connections: [
        {
          names: [{ displayName: 'Lina' }],
          emailAddresses: [{ value: 'lina@example.com' }],
          phoneNumbers: [{ value: '010 0123 4567', canonicalForm: '+201001234567' }],
        },
      ],
      otherContacts: [{ emailAddresses: [{ value: 'someone@example.com' }] }],
    });
    expect(raws).toEqual([
      { name: 'Lina', emails: ['lina@example.com'], phones: ['+201001234567'] },
      { name: null, emails: ['someone@example.com'], phones: [] },
    ]);
  });

  it("reads Microsoft's contacts and people", () => {
    const raws = fromMicrosoftGraph({
      value: [
        {
          displayName: 'Omar',
          emailAddresses: [{ address: 'omar@example.com' }],
          mobilePhone: '+971 50 123 4567',
          homePhones: [],
          businessPhones: ['04 123 4567'],
        },
        {
          displayName: 'Nour',
          scoredEmailAddresses: [{ address: 'nour@example.com' }],
          phones: [{ number: '+33 6 12 34 56 78' }],
        },
      ],
    });
    expect(raws[0]).toEqual({
      name: 'Omar',
      emails: ['omar@example.com'],
      phones: ['+971 50 123 4567', '04 123 4567'],
    });
    expect(raws[1]).toEqual({
      name: 'Nour',
      emails: ['nour@example.com'],
      phones: ['+33 6 12 34 56 78'],
    });
  });

  it("reads the browser's picker and a phone's address book", () => {
    expect(
      fromPicked([{ name: ['Maya'], email: ['maya@example.com'], tel: ['+44 7700 900123'] }]),
    ).toEqual([{ name: 'Maya', emails: ['maya@example.com'], phones: ['+44 7700 900123'] }]);
    expect(
      fromDevice([
        {
          id: '1',
          fullName: null,
          givenName: 'Ali',
          familyName: 'Kaya',
          emails: [{ id: 'e', label: 'home', address: 'ali@example.com' }],
          phones: [{ id: 'p', label: 'mobile', number: '0532 123 45 67' }],
        },
        { id: '2', fullName: 'Ece Demir', emails: [], phones: [{ number: ' ' }] },
      ]),
    ).toEqual([
      { name: 'Ali Kaya', emails: ['ali@example.com'], phones: ['0532 123 45 67'] },
      { name: 'Ece Demir', emails: [], phones: [] },
    ]);
  });

  it('takes nothing that is not a list of objects', () => {
    expect(fromGooglePeople(null)).toEqual([]);
    expect(fromMicrosoftGraph({ value: 'x' })).toEqual([]);
    expect(fromPicked([null, 3, 'x'])).toEqual([]);
    expect(fromDevice(undefined)).toEqual([]);
  });
});

describe('pages', () => {
  it("follows Google's page token and Microsoft's next link on the same API", () => {
    const first = CONTACT_ACCOUNT_LISTS.google[0] as string;
    expect(nextAccountPage('google', { nextPageToken: 'a b' }, first)).toBe(
      `${first}&pageToken=a%20b`,
    );
    expect(nextAccountPage('google', {}, first)).toBeNull();
    expect(
      nextAccountPage(
        'microsoft',
        { '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/contacts?$skip=999' },
        '',
      ),
    ).toBe('/v1.0/me/contacts?$skip=999');
  });

  it('reads every list a page at a time, leaving out a list the person did not give', async () => {
    const asked: string[] = [];
    const get: AccountFetch = async (url, init) => {
      asked.push(url);
      expect(init.headers.Authorization).toBe('Bearer tok');
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url.includes('/otherContacts')) return { ok: false, status: 403, json: async () => ({}) };
      if (url.includes('pageToken=two'))
        return ok({ connections: [{ emailAddresses: [{ value: 'b@example.com' }] }] });
      return ok({
        connections: [{ emailAddresses: [{ value: 'a@example.com' }] }],
        nextPageToken: 'two',
      });
    };
    const pages: number[] = [];
    const read = await readAccount('google', 'https://people.test/', 'tok', get, (n) =>
      pages.push(n),
    );
    expect(read.read).toBe(1);
    expect(read.refused).toBe(1);
    expect(read.raws.map((r) => r.emails)).toEqual([['a@example.com'], ['b@example.com']]);
    expect(pages).toEqual([1, 2]);
    expect(asked[0]?.startsWith('https://people.test/v1/people/me/connections?')).toBe(true);
  });

  it('fails when the access itself is refused', async () => {
    const get: AccountFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(readAccount('microsoft', 'https://graph.test', 't', get)).rejects.toBeInstanceOf(
      AccountReadFailed,
    );
  });
});

describe('the return from an account', () => {
  it('carries the sealed access or why there is none', () => {
    const back = contactReturnFragment({ account: 'google', sealed: 'abc_-1' });
    expect(contactReturnOf(`#${back}`)).toEqual({ account: 'google', sealed: 'abc_-1' });
    expect(
      contactReturnOf(contactReturnFragment({ account: 'microsoft', error: 'denied' })),
    ).toEqual({ account: 'microsoft', error: 'denied' });
    expect(contactReturnOf('contacts=microsoft&error=whatever')).toEqual({
      account: 'microsoft',
      error: 'failed',
    });
    expect(contactReturnOf('contacts=yahoo&sealed=x')).toBeNull();
    expect(contactReturnOf('')).toBeNull();
  });

  it('opens only with the key it was sealed for, as the account it was sealed as', () => {
    const key = newContactKey();
    const sealed = sealContactAccess(key, 'google', 'ya29.secret');
    expect(openContactAccess(key, 'google', sealed)).toBe('ya29.secret');
    expect(openContactAccess(key, 'microsoft', sealed)).toBeNull();
    expect(openContactAccess(newContactKey(), 'google', sealed)).toBeNull();
    expect(openContactAccess('short', 'google', sealed)).toBeNull();
    expect(openContactAccess(key, 'google', 'not+base64')).toBeNull();
  });
});

describe('inviting someone yourself', () => {
  it('writes a national number as it is dialled from abroad, by the inviter’s country', () => {
    expect(toInternational('010 0123 4567', 'EG')).toBe('+201001234567');
    expect(toInternational('+961 3 123 456', 'EG')).toBe('+9613123456');
    expect(toInternational('00971501234567', 'EG')).toBe('+971501234567');
    expect(toInternational('(202) 555-0123', 'US')).toBe('+12025550123');
    expect(toInternational('1 202 555 0123', 'US')).toBe('+12025550123');
    expect(toInternational('8 916 123-45-67', 'RU')).toBe('+79161234567');
    expect(toInternational('347 123 4567', 'IT')).toBe('+393471234567');
    expect(toInternational('07700 900123', 'GB')).toBe('+447700900123');
    expect(toInternational('0501234567', null)).toBeNull();
    expect(toInternational('12345', 'FR')).toBeNull();
  });

  it('offers WhatsApp and a message for a number, mail for an address, with the words written', () => {
    const ways = inviteWays(
      { name: 'Sara', emails: ['sara@example.com'], phones: ['03 123 456'] },
      { text: 'Join me: https://cai.me/i/x', subject: 'Caime' },
      { country: 'LB', ios: true },
    );
    expect(ways.map((w) => w.kind)).toEqual(['whatsapp', 'sms', 'email']);
    expect(ways[0]?.url).toBe(
      'https://wa.me/9613123456?text=Join%20me%3A%20https%3A%2F%2Fcai.me%2Fi%2Fx',
    );
    expect(ways[1]?.url).toBe('sms:+9613123456&body=Join%20me%3A%20https%3A%2F%2Fcai.me%2Fi%2Fx');
    expect(ways[2]?.url).toBe(
      'mailto:sara@example.com?subject=Caime&body=Join%20me%3A%20https%3A%2F%2Fcai.me%2Fi%2Fx',
    );
    const android = inviteWays(
      { name: null, emails: [], phones: ['+33612345678'] },
      { text: 'x', subject: 'y' },
      { country: null, ios: false },
    );
    expect(android.map((w) => w.url)).toEqual([
      'https://wa.me/33612345678?text=x',
      'sms:+33612345678?body=x',
    ]);
  });
});
