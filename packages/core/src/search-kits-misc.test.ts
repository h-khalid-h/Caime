import { describe, expect, it } from 'vitest';
import {
  formatDue,
  formatListTime,
  formatWhen,
  initials,
  joinNames,
  overdueAt,
  textDirection,
} from './format';
import { isUuid, uuidv7, uuidv7Time } from './ids';
import { kitsFor } from './kits';
import {
  fromUnderstanding,
  isPlainText,
  looksLikeSentence,
  parseSearchQuery,
  type SearchUnderstanding,
} from './search';
import { relationshipFit, relationshipLabel, rolesForPicker } from './taxonomy';
import { trustFor } from './trust';

describe('search (PRD §25 examples)', () => {
  it.each([
    ['Sarah', { scope: 'all', text: 'Sarah' }],
    ['Managers', { scope: 'people', relationship: { sphere: 'work', role: 'manager' } }],
    ['my customers', { scope: 'people', relationship: { sphere: 'customer' } }],
    ['proposal', { scope: 'all', text: 'proposal' }],
    [
      'what did Sarah say about the migration?',
      { scope: 'messages', person: 'Sarah', text: 'the migration' },
    ],
    ['PDFs from Sarah', { scope: 'files', fileKind: 'pdf', person: 'Sarah' }],
    ['things Sarah asked me to do', { scope: 'tasks', person: 'Sarah', direction: 'asked_me' }],
    ['Project Alpha conversations', { scope: 'contexts', text: 'Project Alpha' }],
    ['waiting on Sarah', { scope: 'waiting', person: 'Sarah' }],
    ['decisions about pricing', { scope: 'decisions', text: 'pricing' }],
    ['links', { scope: 'links' }],
  ])('%s', (q, expected) => {
    expect(parseSearchQuery(q)).toMatchObject(expected);
  });
  it('explains how it understood the query', () => {
    expect(parseSearchQuery('PDFs from Sarah').interpretation).toBe('PDFs from Sarah');
  });
  it('reads a time at the end as the days to search, never as a person', () => {
    // Wednesday 2026-09-23.
    const now = new Date('2026-09-23T14:00:00Z');
    const at = (q: string) => parseSearchQuery(q, { now });
    expect(at('photos from last week')).toMatchObject({
      scope: 'files',
      fileKind: 'image',
      person: null,
      period: { since: '2026-09-14', until: '2026-09-21', label: 'last week' },
      interpretation: 'All photos · last week',
    });
    expect(at('decisions last week')).toMatchObject({
      scope: 'decisions',
      period: { since: '2026-09-14' },
    });
    expect(at('contract yesterday')).toMatchObject({
      scope: 'all',
      text: 'contract',
      period: { since: '2026-09-22', until: '2026-09-23' },
    });
    expect(at('files from Sarah in March').period).toEqual({
      since: '2026-03-01',
      until: '2026-04-01',
      label: 'March',
    });
    expect(at('files from Sarah in March').person).toBe('Sarah');
    expect(at('this month').period).toMatchObject({ since: '2026-09-01', until: '2026-09-24' });
    expect(at('last Friday').period).toMatchObject({ since: '2026-09-18', until: '2026-09-19' });
    expect(at('invoices 2025').period).toMatchObject({ since: '2025-01-01', until: '2026-01-01' });
    // A period is the rules' understanding: no model for it.
    expect(isPlainText(at('photos from last week'))).toBe(false);
    expect(isPlainText(at('contract yesterday'))).toBe(false);
  });
});

describe('kits (R19)', () => {
  it('a vendor conversation leads with orders, delivery and invoices', () => {
    const ids = kitsFor({ spheres: ['vendor'], isGroup: false, viewerIsMinor: false }).map(
      (k) => k.id,
    );
    expect(ids.slice(0, 4)).toEqual(['approval', 'document_review', 'order_status', 'delivery']);
    expect(ids).toContain('invoice');
    expect(ids).not.toContain('location');
  });
  it('family gets location and albums, not invoices', () => {
    const ids = kitsFor({ spheres: ['family'], isGroup: false, viewerIsMinor: false }).map(
      (k) => k.id,
    );
    expect(ids).toContain('location');
    expect(ids).toContain('shared_album');
    expect(ids).not.toContain('invoice');
  });
  it('money kits are never offered to minors', () => {
    const ids = kitsFor({ spheres: ['family'], isGroup: false, viewerIsMinor: true }).map(
      (k) => k.id,
    );
    expect(ids).not.toContain('payment_request');
  });
});

describe('taxonomy', () => {
  it('neutral roles come first in the picker (R28)', () => {
    const { quick } = rolesForPicker('family');
    expect(quick.map((r) => r.id)).toEqual([
      'parent',
      'child',
      'sibling',
      'partner',
      'spouse',
      'relative',
    ]);
    expect(quick.every((r) => !r.gendered)).toBe(true);
  });
  it('labels', () => {
    expect(relationshipLabel({ sphere: 'work', role: 'manager', orgName: 'DATA C' })).toBe(
      'Manager · DATA C',
    );
    expect(relationshipLabel({ sphere: 'work', role: 'manager', status: 'ended' })).toBe(
      'Former manager',
    );
    expect(relationshipLabel({ sphere: 'friend' })).toBe('Friend');
    expect(relationshipLabel({ sphere: 'other', roleLabel: 'Climbing partner' })).toBe(
      'Climbing partner',
    );
  });
  it('complementary relationships (PRD §53)', () => {
    expect(
      relationshipFit(
        { sphere: 'work', role: 'manager' },
        { sphere: 'work', role: 'direct_report' },
      ),
    ).toBe('complementary');
    expect(
      relationshipFit({ sphere: 'family', role: 'mother' }, { sphere: 'family', role: 'son' }),
    ).toBe('complementary');
    expect(
      relationshipFit({ sphere: 'work', role: 'colleague' }, { sphere: 'work', role: 'colleague' }),
    ).toBe('same');
    expect(
      relationshipFit({ sphere: 'family', role: 'sister' }, { sphere: 'family', role: 'brother' }),
    ).toBe('same');
    expect(
      relationshipFit(
        { sphere: 'customer', role: 'client' },
        { sphere: 'vendor', role: 'account_manager' },
      ),
    ).toBe('complementary');
    expect(
      relationshipFit({ sphere: 'work', role: 'manager' }, { sphere: 'work', role: 'manager' }),
    ).toBe('different');
    expect(relationshipFit({ sphere: 'family' }, { sphere: 'friend' })).toBe('different');
  });
});

describe('trust (PRD §54)', () => {
  it('says what it knows in words', () => {
    expect(
      trustFor({ known: true, emailVerified: true, verifiedOrgName: 'DATA C', kind: 'human' })
        .label,
    ).toBe('Verified at DATA C');
    expect(
      trustFor({ known: false, emailVerified: false, verifiedOrgName: null, kind: 'human' }).level,
    ).toBe('unknown');
    expect(
      trustFor({ known: true, emailVerified: false, verifiedOrgName: null, kind: 'agent' }).label,
    ).toBe('AI agent');
  });
});

describe('format', () => {
  const now = new Date('2026-09-23T14:00:00Z');
  const tz = 'America/New_York';
  it('initials in any script', () => {
    expect(initials('Sarah Smith')).toBe('SS');
    expect(initials('Madonna')).toBe('M');
    expect(initials('سارة أحمد')).toBe('س');
    expect(initials('  ')).toBe('?');
  });
  it('lists', () => {
    expect(joinNames(['Sarah', 'Ahmed', 'Lina'])).toBe('Sarah, Ahmed, and Lina');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 others');
  });
  it('direction', () => {
    expect(textDirection('مرحبا Sarah')).toBe('rtl');
    expect(textDirection('Hi سارة')).toBe('ltr');
    expect(textDirection('123 👍')).toBe('ltr');
  });
  it('list times', () => {
    expect(formatListTime('2026-09-23T13:59:30Z', now, tz)).toBe('now');
    expect(formatListTime('2026-09-23T13:45:00Z', now, tz)).toBe('15m');
    expect(formatListTime('2026-09-23T11:00:00Z', now, tz)).toBe('7:00 AM');
    expect(formatListTime('2026-09-22T15:00:00Z', now, tz)).toBe('Yesterday');
    expect(formatListTime('2026-09-19T15:00:00Z', now, tz)).toBe('Sat');
    expect(formatListTime('2026-08-01T15:00:00Z', now, tz)).toBe('Aug 1');
  });
  it('times inside a sentence', () => {
    expect(formatWhen('2026-09-23T13:59:30Z', now, tz)).toBe('just now');
    expect(formatWhen('2026-09-23T13:45:00Z', now, tz)).toBe('15 min ago');
    expect(formatWhen('2026-09-23T11:00:00Z', now, tz)).toBe('at 7:00 AM');
    expect(formatWhen('2026-09-22T15:00:00Z', now, tz)).toBe('yesterday');
    expect(formatWhen('2026-09-19T15:00:00Z', now, tz)).toBe('on Sat');
    expect(formatWhen('2026-08-01T15:00:00Z', now, tz)).toBe('on Aug 1');
    expect(formatWhen('2025-08-01T15:00:00Z', now, tz)).toBe('on Aug 1, 2025');
  });
  it('due dates', () => {
    expect(formatDue('2026-09-24T13:00:00Z', now, tz)).toBe('Tomorrow');
    expect(formatDue('2026-09-21T13:00:00Z', now, tz)).toBe('2 days ago');
  });
  it('overdue at its time, or when its day is over if it has none', () => {
    // A day with no time is kept at 09:00 where the person is (New York here): it's overdue at
    // the midnight after it, never at nine that morning.
    const nine = '2026-09-24T13:00:00Z';
    expect(overdueAt(nine, true)).toBe(Date.parse(nine));
    expect(overdueAt(nine, false)).toBe(Date.parse('2026-09-25T04:00:00Z'));
  });
});

describe('ids', () => {
  it('uuidv7 is valid, time-ordered and monotonic within a millisecond', () => {
    const t = Date.UTC(2026, 8, 23);
    const ids = Array.from({ length: 50 }, () => uuidv7(t));
    expect(ids.every(isUuid)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(uuidv7Time(ids[0]!)).toBe(t);
    expect(uuidv7(t + 1) > ids[ids.length - 1]!).toBe(true);
  });
});

describe('natural-language search (R17): what a model may read, and how far', () => {
  it('a sentence the rules understood nothing of is one; a name or a term is not', () => {
    expect(isPlainText(parseSearchQuery('anything Sam promised to send me'))).toBe(true);
    expect(looksLikeSentence('anything Sam promised to send me')).toBe(true);
    expect(looksLikeSentence('what Sam owes')).toBe(true);
    expect(looksLikeSentence('ماذا قال سامي عن العقد')).toBe(true);
    expect(looksLikeSentence('Sarah')).toBe(false);
    expect(looksLikeSentence('proposal')).toBe(false);
    expect(looksLikeSentence('venue contract')).toBe(false);
    // What the rules read is theirs, however long.
    expect(isPlainText(parseSearchQuery('what did Sarah say about the migration'))).toBe(false);
    expect(isPlainText(parseSearchQuery('PDFs from Sarah'))).toBe(false);
  });

  it('a model’s reading becomes a query only within what Caime knows', () => {
    const q = fromUnderstanding('anything Sam promised to send me', {
      scope: 'waiting',
      text: '',
      person: 'Sam',
      sphere: null,
      role: null,
      fileKind: null,
      direction: null,
      interpretation: 'What Sam promised you',
    });
    expect(q).toMatchObject({ scope: 'waiting', person: 'Sam', text: '', relationship: null });
    expect(q.interpretation).toBe('What Sam promised you');
    // An unknown scope, sphere, role or file kind is dropped, never run.
    // What a model may answer isn't typed: whatever it says is checked here.
    const loose = fromUnderstanding('my dentists who sent pdfs', {
      scope: 'everything',
      text: 'x'.repeat(400),
      person: null,
      sphere: 'dentists',
      role: 'boss',
      fileKind: 'spreadsheet',
      direction: 'sideways',
      interpretation: '',
    } as unknown as SearchUnderstanding);
    expect(loose.scope).toBe('all');
    expect(loose.relationship).toBeNull();
    expect(loose.fileKind).toBeNull();
    expect(loose.direction).toBeNull();
    expect(loose.text.length).toBeLessThanOrEqual(200);
    expect(loose.interpretation).toBe('Everything matching “my dentists who sent pdfs”');
    // A sphere Caime has, with a role it knows, is kept; a role it doesn't is dropped.
    expect(
      fromUnderstanding('x', {
        scope: 'people',
        text: '',
        person: null,
        sphere: 'work',
        role: 'manager',
        fileKind: null,
        direction: null,
        interpretation: 'Your managers',
      }).relationship,
    ).toEqual({ sphere: 'work', role: 'manager' });
  });
});
