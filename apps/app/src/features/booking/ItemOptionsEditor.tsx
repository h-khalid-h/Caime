/**
 * An item's options in its editor (R60): a size to choose, extras to add. Each option is named,
 * picks one of its choices or any of them, and may be required; each choice is named and, on a
 * paid item, may add to the price. Edited as drafts (a price as typed) and read back whole by
 * `optionsFrom`, which says what's missing rather than saving half an option.
 */
import { ITEM_OPTIONS_MAX, type ItemOption, OPTION_CHOICES_MAX } from '@caime/core/booking';
import { tr } from '@caime/core/i18n';
import Plus from 'lucide-react-native/icons/plus';
import X from 'lucide-react-native/icons/x';
import { View } from 'react-native';
import { Chip, ChoiceChips } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export interface OptionDraft {
  id: string;
  name: string;
  pick: 'one' | 'any';
  required: boolean;
  choices: Array<{ id: string; name: string; price: string }>;
}

const newId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function draftsOf(options: ItemOption[] | undefined): OptionDraft[] {
  return (options ?? []).map((o) => ({
    ...o,
    choices: o.choices.map((c) => ({ ...c, price: c.price ? String(c.price) : '' })),
  }));
}

/** The options as saved, or what to say: every option and choice named, prices as numbers. */
export function optionsFrom(drafts: OptionDraft[], paid: boolean): ItemOption[] | string {
  const out: ItemOption[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    const choices = d.choices.filter((c) => c.name.trim() || c.price.trim());
    if (!name || choices.length === 0 || choices.some((c) => !c.name.trim()))
      return tr('Name each option and its choices.');
    const read: ItemOption['choices'] = [];
    for (const c of choices) {
      const raw = c.price.trim().replace(',', '.');
      const price = paid && raw ? Number(raw) : null;
      if (price !== null && (!Number.isFinite(price) || price < 0))
        return tr('Enter what a choice adds as a number, or leave it empty.');
      read.push({ id: c.id, name: c.name.trim(), price: price || null });
    }
    out.push({ id: d.id, name, pick: d.pick, required: d.required, choices: read });
  }
  return out;
}

export function ItemOptionsEditor({
  options,
  paid,
  onChange,
  testID,
}: {
  options: OptionDraft[];
  /** A free item's choices add nothing to its price. */
  paid: boolean;
  onChange: (next: OptionDraft[]) => void;
  testID: string;
}) {
  const change = (n: number, patch: Partial<OptionDraft>) =>
    onChange(options.map((o, i) => (i === n ? { ...o, ...patch } : o)));
  return (
    <View style={{ gap: 12 }} testID={`${testID}-options`}>
      <Text variant="label">{tr('Options')}</Text>
      {options.length === 0 ? (
        <Text variant="caption" color="textTertiary">
          {tr('A size to choose or extras to add, each with what it adds to the price.')}
        </Text>
      ) : null}
      {options.map((o, n) => (
        <View key={o.id} style={{ gap: 8 }} testID={`${testID}-option-${n}`}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <TextField
                placeholder={tr('Size')}
                value={o.name}
                onChangeText={(name) => change(n, { name })}
                accessibilityLabel={tr('Option')}
                testID={`${testID}-option-${n}-name`}
              />
            </View>
            <IconButton
              icon={X}
              label={tr('Remove the option')}
              onPress={() => onChange(options.filter((_, i) => i !== n))}
              testID={`${testID}-option-${n}-remove`}
            />
          </View>
          <ChoiceChips
            wrap
            flush
            label={tr('They choose')}
            value={o.pick}
            onChange={(pick) => change(n, { pick })}
            options={[
              { value: 'one' as const, label: tr('One of them') },
              { value: 'any' as const, label: tr('Any of them') },
            ]}
            testID={`${testID}-option-${n}-pick`}
          />
          <SwitchRow
            label={tr('They must choose')}
            value={o.required}
            onChange={(required) => change(n, { required })}
            testID={`${testID}-option-${n}-required`}
          />
          {o.choices.map((c, k) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <TextField
                  placeholder={tr('Large')}
                  value={c.name}
                  onChangeText={(name) =>
                    change(n, {
                      choices: o.choices.map((x, j) => (j === k ? { ...x, name } : x)),
                    })
                  }
                  accessibilityLabel={tr('Choice')}
                  testID={`${testID}-option-${n}-choice-${k}`}
                />
              </View>
              {paid ? (
                <View style={{ width: 96 }}>
                  <TextField
                    placeholder="+0"
                    value={c.price}
                    onChangeText={(price) =>
                      change(n, {
                        choices: o.choices.map((x, j) => (j === k ? { ...x, price } : x)),
                      })
                    }
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    accessibilityLabel={tr('Added to the price')}
                    testID={`${testID}-option-${n}-choice-${k}-price`}
                  />
                </View>
              ) : null}
              <IconButton
                icon={X}
                label={tr('Remove the choice')}
                disabled={o.choices.length === 1}
                onPress={() => change(n, { choices: o.choices.filter((_, j) => j !== k) })}
                testID={`${testID}-option-${n}-choice-${k}-remove`}
              />
            </View>
          ))}
          {o.choices.length < OPTION_CHOICES_MAX ? (
            <View style={{ flexDirection: 'row' }}>
              <Chip
                label={tr('Add a choice')}
                icon={Plus}
                onPress={() =>
                  change(n, {
                    choices: [...o.choices, { id: newId('c'), name: '', price: '' }],
                  })
                }
                testID={`${testID}-option-${n}-add-choice`}
              />
            </View>
          ) : null}
        </View>
      ))}
      {options.length < ITEM_OPTIONS_MAX ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip
            label={tr('Add an option')}
            icon={Plus}
            onPress={() =>
              onChange([
                ...options,
                {
                  id: newId('o'),
                  name: '',
                  pick: 'one',
                  required: true,
                  choices: [{ id: newId('c'), name: '', price: '' }],
                },
              ])
            }
            testID={`${testID}-add-option`}
          />
        </View>
      ) : null}
    </View>
  );
}
