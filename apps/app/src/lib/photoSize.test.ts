import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_EDGE, shrinkTo, shrunkFormat, shrunkName } from './photoSize';

describe('photos shrunk on the device before upload', () => {
  it('shrinks a big photo to the longest edge, keeping its shape', () => {
    expect(shrinkTo({ mime: 'image/jpeg', width: 4032, height: 3024 })).toEqual({
      width: 3072,
      height: 2304,
    });
    expect(shrinkTo({ mime: 'image/jpeg', width: 1000, height: 4000 })).toEqual({
      width: 768,
      height: PHOTO_MAX_EDGE,
    });
    expect(shrinkTo({ mime: 'image/png', width: 3000, height: 3000 }, 1024)).toEqual({
      width: 1024,
      height: 1024,
    });
  });

  it('leaves alone what fits, what animates and what it cannot re-encode', () => {
    expect(shrinkTo({ mime: 'image/jpeg', width: 3072, height: 2304 })).toBeNull();
    expect(shrinkTo({ mime: 'image/gif', width: 4000, height: 3000 })).toBeNull();
    expect(shrinkTo({ mime: 'image/heic', width: 4000, height: 3000 })).toBeNull();
    expect(shrinkTo({ mime: 'video/mp4', width: 4000, height: 3000 })).toBeNull();
    // Unknown size: nothing to go on, so it goes as it is.
    expect(shrinkTo({ mime: 'image/jpeg', width: 0, height: 0 })).toBeNull();
    expect(shrinkTo({ mime: null, width: 4000, height: 3000 })).toBeNull();
  });

  it('keeps PNG as PNG and names the file for what it became', () => {
    expect(shrunkFormat('image/png')).toBe('png');
    expect(shrunkFormat('image/jpeg')).toBe('jpeg');
    expect(shrunkFormat('image/webp')).toBe('jpeg');
    expect(shrunkName('IMG_0042.HEIC', 'jpeg')).toBe('IMG_0042.jpg');
    expect(shrunkName('shot.png', 'png')).toBe('shot.png');
    expect(shrunkName('', 'jpeg')).toBe('photo.jpg');
  });
});
