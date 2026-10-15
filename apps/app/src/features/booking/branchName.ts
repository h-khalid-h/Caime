import type { PlaceView } from '@caime/core/api';

/**
 * A branch as an item names it (R92): its own name, else its city or street. Light on purpose:
 * the booking setup and the card form read it, and `@caime/core/places` stays in the places
 * chunk alone.
 */
export const branchName = (p: Pick<PlaceView, 'label' | 'city' | 'street' | 'country'>): string =>
  p.label ?? p.city ?? p.street ?? p.country;
