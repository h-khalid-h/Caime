import { describe, expect, it } from 'vitest';
import { DRAWN_SCALE, imageFor, RENDITION_EDGES } from './renditions';

const f = { url: '/f', thumbUrl: '/f/thumb', previewUrl: '/f/preview' };

describe('an image drawn at its size', () => {
  it('is the thumbnail up to what it covers at 3x, the preview above it', () => {
    expect(imageFor(f, 72)).toBe('/f/thumb');
    expect(imageFor(f, RENDITION_EDGES.thumb / DRAWN_SCALE)).toBe('/f/thumb');
    expect(imageFor(f, 240)).toBe('/f/preview');
  });

  it('is never a smaller one stretched: the original when there is no rendition', () => {
    expect(imageFor({ url: '/g', thumbUrl: null, previewUrl: null }, 72)).toBe('/g');
    expect(imageFor({ ...f, previewUrl: null }, 320)).toBe('/f');
  });
});
