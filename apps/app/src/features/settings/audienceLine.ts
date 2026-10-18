/** Who sees one thing, as a row says it (the privacy evaluator's `Audience`). */
import { listed, tr } from '@caime/core/i18n';
import type { Audience } from '@caime/core/privacy';
import { SPHERE_DEFS } from '@caime/core/taxonomy';

export function audienceLine(a: Audience | undefined): string {
  if (!a) return tr('Your connections');
  switch (a.kind) {
    case 'everyone':
      return tr('Everyone');
    case 'connections':
      return tr('Your connections');
    case 'nobody':
      return tr('Nobody');
    case 'spheres':
      return a.spheres.length
        ? listed(a.spheres.map((s) => tr(SPHERE_DEFS[s].plural)))
        : tr('Some of your people');
  }
}
