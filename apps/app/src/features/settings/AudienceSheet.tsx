/**
 * Who sees one thing (the privacy evaluator's `Audience`): its line in a row, and the sheet that
 * picks it. The privacy screen's fields and a person's places (R92) both use them.
 */
import { tr } from '@caime/core/i18n';
import type { Audience } from '@caime/core/privacy';
import type { Sphere } from '@caime/core/taxonomy';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/ui/Button';
import { ChoiceList } from '@/ui/ChoiceList';
import { Sheet } from '@/ui/Sheet';
import { SpherePicker } from '@/ui/SpherePicker';

type Kind = Audience['kind'];

/** Who sees one thing: everyone, the people they're connected with, only some kinds of them, or nobody. */
export function AudienceSheet({
  title,
  current,
  minor = false,
  onClose,
  onSave,
}: {
  title: string;
  current: Audience | undefined;
  /** Under 18 (R29) nothing is shown to everyone, so it isn't offered: the server would narrow it. */
  minor?: boolean;
  onClose: () => void;
  onSave: (a: Audience) => void;
}) {
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'connections');
  const [spheres, setSpheres] = useState<Sphere[]>(
    current?.kind === 'spheres' ? current.spheres : [],
  );
  const some = kind === 'spheres';
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        some ? (
          <Button
            label={tr('Save')}
            size="lg"
            block
            disabled={!spheres.length}
            onPress={() => onSave({ kind: 'spheres', spheres })}
            testID="audience-save"
          />
        ) : undefined
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <ChoiceList<Kind>
          label={title}
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k !== 'spheres') onSave({ kind: k } as Audience);
          }}
          testID="audience-kind"
          options={[
            ...(minor ? [] : [{ value: 'everyone' as const, label: tr('Everyone') }]),
            { value: 'connections', label: tr('Your connections') },
            {
              value: 'spheres',
              label: tr('Only some of your people'),
              detail: tr('By how you know them'),
            },
            { value: 'nobody', label: tr('Nobody') },
          ]}
        />
      </View>
      {some ? (
        <SpherePicker
          multiple
          plural
          wrap
          flush
          label={tr('Who sees it')}
          value={spheres}
          onChange={setSpheres}
          testID="audience"
        />
      ) : null}
    </Sheet>
  );
}
