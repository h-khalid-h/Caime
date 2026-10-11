/**
 * Choosing a sphere, or several (R77): how someone is known (one, each in its sphere's colour
 * when chosen: a brand moment), who a rule or an item is for (several), as chips with each
 * sphere's icon and name in the reader's language. One picker wherever spheres are chosen,
 * never a row of its own.
 */
import { sphereStyles } from '@caime/brand/tokens';
import { tr } from '@caime/core/i18n';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { useMemo } from 'react';
import { useTheme } from '@/theme/theme';
import { type ChoiceChip, ChoiceChips, type ChoiceChipsProps, type DistributiveOmit } from './Chip';
import { sphereIcon } from './SphereIcon';

type Props = DistributiveOmit<ChoiceChipsProps<Sphere>, 'options'> & {
  /** Which spheres to offer; all of them without. */
  spheres?: readonly Sphere[];
  /** Named as the people ("Friends", "Vendors"): who sees something, who a rule is for. */
  plural?: boolean;
  /** Each in its sphere's own colour when chosen. */
  tinted?: boolean;
  /** Each chip's own id, when it isn't the group's with the sphere. */
  optionTestID?: (sphere: Sphere) => string;
};

export function SpherePicker({ spheres = SPHERES, plural, tinted, optionTestID, ...rest }: Props) {
  const t = useTheme();
  const options = useMemo<Array<ChoiceChip<Sphere>>>(
    () =>
      spheres.map((s) => {
        const st = t.sphere(s);
        return {
          value: s,
          label: tr(plural ? SPHERE_DEFS[s].plural : SPHERE_DEFS[s].label),
          icon: sphereIcon(sphereStyles[s]?.icon),
          colours: tinted ? { bg: st.fill, fg: st.strong } : undefined,
          testID: optionTestID?.(s),
        };
      }),
    [spheres, plural, tinted, optionTestID, t],
  );
  return <ChoiceChips<Sphere> {...(rest as ChoiceChipsProps<Sphere>)} options={options} />;
}
