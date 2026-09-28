/**
 * Choosing a collection (PRD §69) as a folder is chosen: the person's, newest first and found by
 * name once there are many, each a tap, or a new one named right there. A new one named like one
 * they have, in any case or spacing, is that one ("customer files" is their "Customer Files"), so
 * the same collection is never made twice.
 */
import { COLLECTION_MAX, collectionName } from '@caime/core/automations';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { wordsMatch } from '@/features/geo/find';
import { useTheme } from '@/theme/theme';
import { Check, Folder, Plus } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** How many are offered before the rest are found by name. */
const SHOWN = 6;

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

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

  const row = (o: {
    key: string;
    icon: Icon;
    title: string;
    detail?: string;
    selected: boolean;
    onPress: () => void;
    first: boolean;
    testID?: string;
  }) => (
    <Pressable
      key={o.key}
      accessibilityRole="radio"
      accessibilityState={{ checked: o.selected }}
      accessibilityLabel={o.detail ? `${o.title}, ${o.detail}` : o.title}
      onPress={o.onPress}
      haptic
      testID={o.testID}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        minHeight: 52,
        borderTopWidth: o.first ? 0 : 1,
        borderTopColor: t.c.border,
        backgroundColor: o.selected ? t.c.accentSoft : hovered ? t.c.surfaceHover : 'transparent',
      })}
    >
      <o.icon size={20} color={o.selected ? t.c.accentStrong : t.c.textSecondary} />
      <View style={{ flex: 1, gap: 2, paddingVertical: 8 }}>
        <Text variant="bodyStrong">{o.title}</Text>
        {o.detail ? (
          <Text variant="caption" color="textSecondary">
            {o.detail}
          </Text>
        ) : null}
      </View>
      {o.selected ? <Check size={20} color={t.c.accentStrong} strokeWidth={2.6} /> : null}
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }} testID={testID}>
      {finding ? (
        <TextField
          label="Find a collection"
          value={query}
          onChangeText={setQuery}
          placeholder={names[SHOWN]}
          maxLength={COLLECTION_MAX}
          testID={`${testID}-find`}
        />
      ) : null}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: t.c.surface,
        }}
      >
        {creating ? (
          <View style={{ padding: 12, backgroundColor: t.c.accentSoft }}>
            <TextField
              label="New collection"
              value={fresh}
              onChangeText={(text) => {
                setFresh(text);
                onChange(named(text));
              }}
              placeholder={placeholder}
              maxLength={COLLECTION_MAX}
              autoFocus={making}
              hint={had ? `You have ${had}: it goes there.` : undefined}
              testID={`${testID}-name`}
            />
          </View>
        ) : (
          row({
            key: 'new',
            icon: Plus,
            title: 'New collection',
            selected: false,
            first: true,
            testID: `${testID}-new`,
            onPress: () => {
              // Named as it was looked for, if it was.
              setFresh(typed);
              setMaking(true);
              onChange(named(typed));
            },
          })
        )}
        {shown.map((n) => {
          const count = collections.find((c) => c.name === n)?.count ?? 0;
          return row({
            key: n,
            icon: Folder,
            title: n,
            ...(count ? { detail: `${count} saved` } : {}),
            selected: !creating && value === n,
            first: false,
            onPress: () => {
              setMaking(false);
              onChange(n);
            },
          });
        })}
      </View>
      {finding && !typed ? (
        <Text variant="caption" color="textSecondary">
          {`And ${names.length - shown.length} more: find them by name.`}
        </Text>
      ) : null}
      {typed && !shown.length ? (
        <Text variant="caption" color="textSecondary">
          None is called that yet: New collection makes it.
        </Text>
      ) : null}
    </View>
  );
}
