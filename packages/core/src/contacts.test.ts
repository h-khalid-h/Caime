import { describe, expect, it } from 'vitest';
import { CONTACTS_MAX, emailsOf, parseContacts } from './contacts';

const ICLOUD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//Apple Inc.//iCloud Web Address Book 2510B41//EN',
  'N:Haddad;Sara;;;',
  'FN:Sara Haddad',
  'ORG:Partner Dental;',
  'item1.EMAIL;type=INTERNET;type=pref:Sara@Partner.example',
  'item1.X-ABLabel:_$!<Work>!$_',
  'EMAIL;type=INTERNET;type=HOME:sara.home@example.com',
  'TEL;type=CELL;type=VOICE;type=pref:+961 3 123 456',
  'TEL;type=HOME:(01) 234-567',
  'NOTE:A long note that the exporter folds across lines because it is longer than',
  '  seventy-five octets, which is what vCard allows per line.',
  'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL',
  ' DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjI=',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:;;;;',
  'FN:',
  'ORG:Nile Dental',
  'EMAIL;type=INTERNET;type=WORK;type=pref:hello@nile.example',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Nobody;;;;',
  'FN:Nobody Here',
  'END:VCARD',
].join('\r\n');

const ANDROID_21 = [
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D8=AD=D8=AF=D8=A7=D8=AF;=D9=86=D9=88=D8=B1;;;',
  'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D9=86=D9=88=D8=B1 =D8=AD=D8=AF=',
  '=D8=A7=D8=AF',
  'TEL;CELL:00201001234567',
  'EMAIL;PREF;INTERNET:NOOR@EXAMPLE.COM',
  'EMAIL;INTERNET:noor@example.com',
  'END:VCARD',
].join('\r\n');

const VCARD_4 = [
  'BEGIN:VCARD',
  'VERSION:4.0',
  'FN:Alex Rivera\\, PhD',
  'EMAIL;PREF=1:alex@example.org',
  'TEL;VALUE=uri;TYPE="voice,cell":tel:+1-555-010-0199',
  'END:VCARD',
].join('\n');

describe('parseContacts: vCard', () => {
  it('reads an iCloud export: names, every address lower-cased once, numbers, nothing of photos or notes', () => {
    const file = parseContacts(`﻿${ICLOUD}`);
    expect(file.format).toBe('vcard');
    expect(file.read).toBe(3);
    expect(file.contacts).toEqual([
      {
        name: 'Sara Haddad',
        emails: ['sara@partner.example', 'sara.home@example.com'],
        phones: ['+9613123456', '01234567'],
      },
      { name: 'Nile Dental', emails: ['hello@nile.example'], phones: [] },
      { name: 'Nobody Here', emails: [], phones: [] },
    ]);
    expect(emailsOf(file)).toEqual([
      'sara@partner.example',
      'sara.home@example.com',
      'hello@nile.example',
    ]);
  });

  it('reads an Android 2.1 card: quoted-printable Arabic names, a soft line break, an international prefix', () => {
    const file = parseContacts(ANDROID_21);
    expect(file.contacts).toEqual([
      { name: 'نور حداد', emails: ['noor@example.com'], phones: ['+201001234567'] },
    ]);
  });

  it('reads a 4.0 card: escaped commas, a tel: URI, a quoted parameter with a colon in it', () => {
    const file = parseContacts(VCARD_4);
    expect(file.contacts).toEqual([
      { name: 'Alex Rivera, PhD', emails: ['alex@example.org'], phones: ['+15550100199'] },
    ]);
  });

  it('names from N when FN is missing, and reads to the cap', () => {
    const many = Array.from(
      { length: CONTACTS_MAX + 5 },
      (_, i) =>
        `BEGIN:VCARD\nVERSION:3.0\nN:Person;Number ${i};;;\nEMAIL:p${i}@example.com\nEND:VCARD`,
    ).join('\n');
    const file = parseContacts(many);
    expect(file.contacts).toHaveLength(CONTACTS_MAX);
    expect(file.contacts[0]?.name).toBe('Number 0 Person');
    expect(file.read).toBe(CONTACTS_MAX);
  });
});

const GOOGLE_OLD = [
  'Name,Given Name,Additional Name,Family Name,E-mail 1 - Type,E-mail 1 - Value,E-mail 2 - Type,E-mail 2 - Value,Phone 1 - Type,Phone 1 - Value',
  'Sara Haddad,Sara,,Haddad,* Work,Sara@partner.example,Home,sara.home@example.com,Mobile,+961 3 123 456',
  '"Rivera, Alex",Alex,,Rivera,,,,,Mobile,+1 555 010 0199',
  ',,,,,,,,,',
  'Two Addresses,Two,,Addresses,* Other,one@example.com ::: two@example.com,,,,',
].join('\r\n');

const GOOGLE_NEW = [
  'First Name,Middle Name,Last Name,Phonetic First Name,Organization Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value',
  'Noor,,Haddad,,Macrocare,,noor@example.com,Mobile,01001234567',
  ',,,,Nile Dental,,hello@nile.example,,',
].join('\n');

const OUTLOOK_DE = [
  '"Vorname";"Nachname";"E-mail Address";"E-mail 2 Address";"E-mail Display Name";"Mobile Phone"',
  '"Sara";"Haddad";"sara@partner.example";"";"Sara Haddad (sara@partner.example)";"+961 3 123 456"',
].join('\r\n');

const OUTLOOK_EN = [
  'First Name,Middle Name,Last Name,Company,E-mail Address,E-mail 2 Address,E-mail 3 Address,Primary Phone,Mobile Phone',
  'Alex,,Rivera,,alex@example.org,ALEX@example.org,,,"555 010 0199"',
  'Line,"Break ""quoted""",Name,,"line@example.com",,,,',
].join('\r\n');

describe('parseContacts: CSV', () => {
  it('reads Google’s export, old header: names, both addresses, several in one cell, a quoted name', () => {
    const file = parseContacts(GOOGLE_OLD);
    expect(file.format).toBe('csv');
    expect(file.read).toBe(3);
    expect(file.contacts).toEqual([
      {
        name: 'Sara Haddad',
        emails: ['sara@partner.example', 'sara.home@example.com'],
        phones: ['+9613123456'],
      },
      { name: 'Rivera, Alex', emails: [], phones: ['+15550100199'] },
      { name: 'Two Addresses', emails: ['one@example.com', 'two@example.com'], phones: [] },
    ]);
  });

  it('reads Google’s export, new header: the organization names a card with no person', () => {
    const file = parseContacts(GOOGLE_NEW);
    expect(file.contacts).toEqual([
      { name: 'Noor Haddad', emails: ['noor@example.com'], phones: ['01001234567'] },
      { name: 'Nile Dental', emails: ['hello@nile.example'], phones: [] },
    ]);
  });

  it('reads Outlook’s export with semicolons and quotes, and never the display-name column as an address', () => {
    const file = parseContacts(OUTLOOK_DE);
    // German column names aren't known: the address columns are, and the person is found by them.
    expect(file.contacts).toEqual([
      { name: null, emails: ['sara@partner.example'], phones: ['+9613123456'] },
    ]);
  });

  it('reads Outlook’s English export: a repeated address once, doubled quotes inside a cell', () => {
    const file = parseContacts(OUTLOOK_EN);
    expect(file.contacts).toEqual([
      { name: 'Alex Rivera', emails: ['alex@example.org'], phones: ['5550100199'] },
      { name: 'Line Break "quoted" Name', emails: ['line@example.com'], phones: [] },
    ]);
  });

  it('reads nothing from what isn’t a contacts file', () => {
    expect(parseContacts('Hello there\nNot a file')).toEqual({
      format: null,
      contacts: [],
      read: 0,
    });
    expect(parseContacts('')).toEqual({ format: null, contacts: [], read: 0 });
    expect(parseContacts('Name,Email\n')).toEqual({ format: 'csv', contacts: [], read: 0 });
  });
});
