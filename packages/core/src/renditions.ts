/**
 * The sizes an image is kept at (R70), shared by the server that makes them and the app that
 * picks one: the thumbnail covers what's drawn up to 160 points on a 3x screen, the preview what's
 * drawn larger, and the original is for a viewer that zooms. Pure: the app takes it by subpath.
 */
export const RENDITION_EDGES = { thumb: 480, preview: 1280 } as const;

/** The densest screen an image is drawn for. */
export const DRAWN_SCALE = 3;

/** Which of an image's addresses to draw at `points` (its longer side): never one stretched. */
export function imageFor(
  f: { url: string; thumbUrl: string | null; previewUrl: string | null },
  points: number,
): string {
  if (points * DRAWN_SCALE <= RENDITION_EDGES.thumb && f.thumbUrl) return f.thumbUrl;
  return f.previewUrl ?? f.url;
}
