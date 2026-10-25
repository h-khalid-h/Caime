/**
 * Which samples of a shared screen are kept as frames (M17 I13h): the first, a change that holds,
 * never a flash.
 */
import { describe, expect, it } from 'vitest';
import { changeShare, FrameWatch, greyOf } from './frames';

const flat = (level: number, n = 48 * 27) => new Uint8Array(n).fill(level);
/** A sample whose first `share` of cells sit at `level`, the rest at 40. */
const partly = (share: number, level: number, n = 48 * 27) => {
  const s = flat(40, n);
  for (let i = 0; i < Math.round(n * share); i++) s[i] = level;
  return s;
};

describe('a shared screen’s frames (M17 I13h)', () => {
  it('reads a sample’s grey levels from its pixels', () => {
    expect(greyOf([255, 255, 255, 255, 0, 0, 0, 255])).toEqual(new Uint8Array([255, 0]));
    // Pure green weighs more than pure red to the eye.
    expect(greyOf([255, 0, 0, 255])[0]).toBeLessThan(greyOf([0, 255, 0, 255])[0] ?? 0);
  });

  it('measures the share of cells that moved past the level', () => {
    expect(changeShare(flat(40), flat(40))).toBe(0);
    expect(changeShare(flat(40), flat(50))).toBe(0);
    expect(changeShare(flat(40), partly(0.1, 200))).toBeCloseTo(0.1, 2);
    expect(changeShare(new Uint8Array(), new Uint8Array())).toBe(0);
  });

  it('keeps the first sample, then a change that holds on two samples, never a flash', () => {
    const watch = new FrameWatch();
    expect(watch.next(flat(40))).toBe(true);
    // The same screen, sample after sample.
    expect(watch.next(flat(40))).toBe(false);
    expect(watch.next(flat(45))).toBe(false);
    // A flash: changed for one sample, back the next.
    expect(watch.next(partly(0.5, 200))).toBe(false);
    expect(watch.next(flat(40))).toBe(false);
    // A slide turned: changed, and still changed.
    expect(watch.next(partly(0.5, 200))).toBe(false);
    expect(watch.next(partly(0.5, 200))).toBe(true);
    // Now that's the kept one: the same again keeps nothing.
    expect(watch.next(partly(0.5, 200))).toBe(false);
    // A cursor crossing a corner of that slide moves too few cells to count.
    const cursor = partly(0.5, 200);
    for (let i = 0; i < Math.round(cursor.length * 0.02); i++) cursor[i] = 255;
    expect(watch.next(cursor)).toBe(false);
    expect(watch.next(cursor)).toBe(false);
  });
});
