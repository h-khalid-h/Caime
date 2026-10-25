/**
 * Whether a shared screen changed (M17 I13h), from small grey samples of it: the recording's
 * browser samples each shown screen every couple of seconds (`screenFrames.ts`) and keeps a frame
 * at each change, which the write-up reads. A sample is the grey level of each of a few hundred
 * cells; a change is a share of them moved past a level, held on two samples running, so a flash
 * or a cursor passing is skipped and a slide turned is kept. Pure, so it's tested without a screen.
 */
import { FRAME_CHANGE_LEVEL, FRAME_CHANGE_SHARE } from '@caime/core/calls';

/** The grey level of each cell of a sample, from its RGBA pixels (a canvas's image data). */
export function greyOf(rgba: ArrayLike<number>): Uint8Array {
  const cells = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < cells.length; i++) {
    const p = i * 4;
    // Luma, as the eye weighs the channels (BT.601).
    cells[i] = Math.round(
      0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0),
    );
  }
  return cells;
}

/** The share of cells whose level moved past `level` between two samples of the same size. */
export function changeShare(a: Uint8Array, b: Uint8Array, level = FRAME_CHANGE_LEVEL): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let moved = 0;
  for (let i = 0; i < n; i++) if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > level) moved++;
  return moved / n;
}

/**
 * Decides which samples are kept as frames: the first, then one whose change from the last kept
 * has held on two samples running.
 */
export class FrameWatch {
  private kept: Uint8Array | null = null;
  private pending = false;

  /** Whether this sample is a frame to keep. */
  next(sample: Uint8Array, share = FRAME_CHANGE_SHARE): boolean {
    if (!this.kept) {
      this.kept = sample;
      return true;
    }
    if (changeShare(this.kept, sample) < share) {
      this.pending = false;
      return false;
    }
    if (!this.pending) {
      this.pending = true;
      return false;
    }
    this.pending = false;
    this.kept = sample;
    return true;
  }
}
