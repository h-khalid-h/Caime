import { describe, expect, it } from 'vitest';
import { applySplitOp, prepareKitFields, type SplitShare, shareOut, splitState } from './kit-cards';
import { kitsFor } from './kits';

const A = 'a';
const B = 'b';
const C = 'c';

describe('splits (R38)', () => {
  it('share what was paid equally among everyone else, as the currency keeps it', () => {
    expect(shareOut({ value: 90, currency: 'EUR' }, A, [A, B, C])).toEqual([
      { userId: B, amount: 30, settledAt: null, settledBy: null },
      { userId: C, amount: 30, settledAt: null, settledBy: null },
    ]);
    // What rounding leaves over stays with whoever paid: the shares never add up to more.
    expect(shareOut({ value: 100, currency: 'EGP' }, A, [A, B, C]).map((s) => s.amount)).toEqual([
      33.33, 33.33,
    ]);
    expect(shareOut({ value: 1000, currency: 'JPY' }, A, [B, C, A]).map((s) => s.amount)).toEqual([
      333, 333,
    ]);
    expect(shareOut({ value: 4.35, currency: 'USD' }, A, [A, B]).map((s) => s.amount)).toEqual([
      2.17,
    ]);
    expect(shareOut({ value: 10, currency: null }, A, [A, B, C, 'd']).map((s) => s.amount)).toEqual(
      [2.5, 2.5, 2.5],
    );
    // Alone, nobody owes anything: the card isn't made (the server refuses it).
    expect(shareOut({ value: 10, currency: 'EUR' }, A, [A])).toEqual([]);
  });

  it('are settled share by share, by who owes it or who paid, and settled once all are', () => {
    const shares = shareOut({ value: 90, currency: 'EUR' }, A, [A, B, C]);
    expect(splitState(shares)).toBe('open');
    expect(splitState([])).toBe('open');
    const at = '2026-10-01T10:00:00.000Z';
    const bySelf = applySplitOp(
      shares,
      { op: 'settle', userId: B },
      { userId: B, isCreator: false, at },
    );
    expect(bySelf).toMatchObject({ ok: true });
    const one = (bySelf as { shares: SplitShare[] }).shares;
    expect(one[0]).toEqual({ userId: B, amount: 30, settledAt: at, settledBy: B });
    expect(splitState(one)).toBe('open');
    // C's share is nobody's but C's or A's to mark.
    expect(
      applySplitOp(one, { op: 'settle', userId: C }, { userId: B, isCreator: false, at }),
    ).toMatchObject({
      ok: false,
      forbidden: true,
    });
    const byPayer = applySplitOp(
      one,
      { op: 'settle', userId: C },
      { userId: A, isCreator: true, at },
    );
    const all = (byPayer as { shares: SplitShare[] }).shares;
    expect(all[1]).toMatchObject({ settledAt: at, settledBy: A });
    expect(splitState(all)).toBe('settled');
    // Marking what's already marked changes nothing; taking it back opens the split again.
    expect(
      applySplitOp(all, { op: 'settle', userId: C }, { userId: C, isCreator: false, at }),
    ).toEqual({
      ok: true,
      shares: all,
    });
    const back = applySplitOp(
      all,
      { op: 'unsettle', userId: C },
      { userId: C, isCreator: false, at },
    );
    expect((back as { shares: SplitShare[] }).shares[1]).toMatchObject({
      settledAt: null,
      settledBy: null,
    });
    expect(splitState((back as { shares: SplitShare[] }).shares)).toBe('open');
    expect(
      applySplitOp(all, { op: 'settle', userId: 'nobody' }, { userId: A, isCreator: true, at }),
    ).toMatchObject({
      ok: false,
    });
  });

  it('take a title and what was paid, and are offered to friends and family, never with a minor', () => {
    expect(
      prepareKitFields('split', { title: 'Dinner', amount: { value: 90, currency: 'EUR' } }),
    ).toMatchObject({
      ok: true,
      fields: { title: 'Dinner', amount: { value: 90, currency: 'EUR' } },
    });
    expect(prepareKitFields('split', { title: 'Dinner' })).toMatchObject({ ok: false });
    expect(
      prepareKitFields('split', { title: 'Dinner', amount: { value: 0, currency: 'EUR' } }),
    ).toMatchObject({
      ok: false,
    });
    const offered = (viewerIsMinor: boolean, isBusiness = false) =>
      kitsFor({ spheres: ['friend'], isGroup: true, viewerIsMinor, isBusiness }).map((k) => k.id);
    expect(offered(false)).toContain('split');
    expect(offered(true)).not.toContain('split');
    expect(offered(false, true)).not.toContain('split');
  });
});
