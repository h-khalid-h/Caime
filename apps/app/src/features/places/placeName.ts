import type { PlaceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { PLACE_KIND_LABELS } from '@caime/core/places';

/** A place's own name, else its kind's (R92). */
export const placeName = (p: Pick<PlaceView, 'label' | 'kind'>) =>
  p.label ?? tr(PLACE_KIND_LABELS[p.kind]);
