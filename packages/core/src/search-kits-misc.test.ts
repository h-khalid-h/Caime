import { describe, expect, it } from 'vitest';
import {
  formatDue,
  formatListTime,
  formatWhen,
  initials,
  joinNames,
  textDirection,
} from './format';
import { isUuid, uuidv7, uuidv7Time } from './ids';
import { kitsFor } from './kits';
import { parseSearchQuery } from './search';
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
