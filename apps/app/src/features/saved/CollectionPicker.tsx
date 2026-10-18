/**
 * Choosing a collection (PRD §69) as a folder is chosen: the person's, newest first and found by
 * name once there are many, each a tap, or a new one named right there. A new one named like one
 * they have, in any case or spacing, is that one ("customer files" is their "Customer Files"), so
 * the same collection is never made twice.
 */
import { COLLECTION_MAX, collectionName } from '@caime/core/automations';
import { tr } from '@caime/core/i18n';
import Folder from 'lucide-react-native/icons/folder';
import Plus from 'lucide-react-native/icons/plus';
import { useState } from 'react';
import { View } from 'react-native';
import { wordsMatch } from '@/lib/find';
import { useTheme } from '@/theme/theme';
import { ChoiceList } from '@/ui/ChoiceList';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** How many are offered before the rest are found by name. */
const SHOWN = 6;
/** The choice that makes a new one; a collection's own choice is `in:` and its name. */
const NEW = 'new';

export function CollectionPicker({
  value,
  onChange,
  collections,
  label,
  placeholder,
  testID,
}: {
  /** The collection chosen: one they have, or a new one's name; null while a new one has none. */
  value: string | null;
  onChange: (name: string | null) => void;
  /** The person's collections, newest first, with how much is in each. */
  collections: Array<{ name: string; count: number }>;
  label: string;
  /** An example name for a new one. */
  placeholder: string;
  testID: string;
}) {
  const t = useTheme();
  const names = collections.map((c) => c.name);
  const theirs = (name: string) => names.find((n) => n.toLowerCase() === name.toLowerCase());
  const [making, setMaking] = useState(false);
  // Shown in the field while their collections load, so what's chosen is never blank.
  const [fresh, setFresh] = useState(() => (names.length ? '' : (value ?? '')));
  const [query, setQuery] = useState('');
  // With none yet, a new one is the only choice.
  const creating = making || !names.length || (value !== null && !theirs(value));
  const finding = names.length > SHOWN;
  const typed = query.trim();
  let shown = typed ? names.filter((n) => wordsMatch([n], typed)) : names.slice(0, SHOWN);
  // The one chosen is always in sight.
  if (!typed && !creating && value && !shown.includes(value))
    shown = [value, ...shown.slice(0, SHOWN - 1)];
  const named = (text: string) =>
    text.trim() ? (theirs(collectionName(text)) ?? collectionName(text)) : null;
  const had = fresh.trim() ? theirs(collectionName(fresh)) : undefined;

  return (
    <View style={{ gap: 10 }} testID={testID}>
      {finding ? (
        <TextField
          label={tr('Find a collection')}
          value={query}
          onChangeText={setQuery}
          placeholder={names[SHOWN]}
          maxLength={COLLECTION_MAX}
          testID={`${testID}-find`}
        />
      ) : null}
      <View
        style={{
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: t.radii.md,
          overflow: 'hidden',
          backgroundColor: t.c.surface,
        }}
      >
        {creating ? (
          <View style={{ padding: 12, backgroundColor: t.c.accentSoft }}>
            <TextField
              label={tr('New collection')}
              value={fresh}
              onChangeText={(text) => {
                setFresh(text);
                onChange(named(text));
              }}
              placeholder={placeholder}
              maxLength={COLLECTION_MAX}
              autoFocus={making}
              hint={had ? tr('You have {had}: it goes there.', { had }) : undefined}
              testID={`${testID}-name`}
            />
          </View>
        ) : null}
        <ChoiceList<string>
          label={label}
          value={creating || !value ? null : `in:${value}`}
          onChange={(key) => {
            if (key === NEW) {
              // Named as it was looked for, if it was.
              setFresh(typed);
              setMaking(true);
              onChange(named(typed));
              return;
            }
            setMaking(false);
            onChange(key.slice(3));
          }}
          options={[
            ...(creating
              ? []
              : [{ value: NEW, label: tr('New collection'), icon: Plus, testID: `${testID}-new` }]),
            ...shown.map((n) => {
              const count = collections.find((c) => c.name === n)?.count ?? 0;
              return {
                value: `in:${n}`,
                label: n,
                icon: Folder,
                ...(count ? { detail: tr('{count} saved', { count }) } : {}),
              };
            }),
          ]}
        />
      </View>
      {finding && !typed ? (
        <Text variant="caption" color="textSecondary">
          {tr('And {count} more: find them by name.', { count: names.length - shown.length })}
        </Text>
      ) : null}
      {typed && !shown.length ? (
        <Text variant="caption" color="textSecondary">
          {tr('None is called that yet: New collection makes it.')}
        </Text>
      ) : null}
    </View>
  );
}
