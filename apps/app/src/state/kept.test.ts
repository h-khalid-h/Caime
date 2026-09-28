import type { MeView } from '@caishy/core/api';
import { describe, expect, it } from 'vitest';
import { keepUser, keptId, keptUser } from './kept';

const noor = { id: 'u-noor', displayName: 'Noor' } as MeView;

describe('the account kept on the device', () => {
  it('comes back in the shape it was kept in, and only then', () => {
    expect(keptUser(keepUser(noor, '5'), '5')).toEqual(noor);
    // Kept by another version (a birth year and a region, say): asked for again, not misread.
    expect(keptUser(keepUser(noor, '4'), '5')).toBeNull();
    expect(keptUser(JSON.stringify(noor), '5')).toBeNull();
    expect(keptUser('not json', '5')).toBeNull();
    expect(keptUser(null, '5')).toBeNull();
  });

  it('says whose it is, whichever version kept it', () => {
    expect(keptId(keepUser(noor, '5'))).toBe('u-noor');
    expect(keptId(JSON.stringify(noor))).toBe('u-noor');
    expect(keptId(null)).toBeNull();
    expect(keptId('{')).toBeNull();
  });
});
