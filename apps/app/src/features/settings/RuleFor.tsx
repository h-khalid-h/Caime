/**
 * Who a rule is for (a reminder under Automations, quiet hours under Notifications and
 * priorities): a kind of relationship, picked before the rule is made or found.
 */
import { tr } from '@caime/core/i18n';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Choice } from './SettingsPage';

/** A kind of relationship, for a reminder or quiet hours: made (or found) as its rule. */
export function RuleFor({
  open,
  title,
  subtitle,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onPick: (sphere: Sphere) => Promise<void>;
}) {
  const [sphere, setSphere] = useState<Sphere>('vendor');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <Button
          label={tr('Next')}
          block
          size="lg"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onPick(sphere);
            } finally {
              setBusy(false);
            }
          }}
          testID="rule-for-next"
        />
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <Choice<Sphere>
          label={tr('Who it’s for')}
          value={sphere}
          onChange={setSphere}
          options={SPHERES.filter((s) => s !== 'other').map((s) => ({
            value: s,
            label: tr(SPHERE_DEFS[s].plural),
          }))}
        />
      </View>
    </Sheet>
  );
}
