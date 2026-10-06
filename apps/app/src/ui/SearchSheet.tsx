/**
 * Choosing one from a long list (a country, a currency, a time zone, a language): a sheet that
 * finds it as it's typed, the one chosen first and marked, read as one choice by a screen reader.
 */

import { tr } from '@caime/core/i18n';
import Check from 'lucide-react-native/icons/check';
import Search from 'lucide-react-native/icons/search';
import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { ListRow } from './ListRow';
import { useLayout } from './layout';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { TextField } from './TextField';

export interface SearchItem {
  /** What's chosen (a code, an id). */
  key: string;
  title: string;
  subtitle?: string;
  /** Shown before the title (a flag), hidden from screen readers. */
  mark?: string;
}

export function SearchSheet({
  open,
  onClose,
  title,
  items,
  value,
  onPick,
  matches,
  searchLabel,
  loading = false,
  failed = false,
  onRetry,
  empty = tr('Nothing by that name.'),
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: SearchItem[];
  value: string | null;
  onPick: (key: string) => void;
  /** Whether an item is what's typed. */
  matches: (item: SearchItem, term: string) => boolean;
  searchLabel: string;
  loading?: boolean;
  failed?: boolean;
  /** Asks for the list again, offered when it didn't load. */
  onRetry?: () => void;
  empty?: string;
  testID?: string;
}) {
  const t = useTheme();
  const { height, desktop } = useLayout();
  const [term, setTerm] = useState('');
  const chosen = items.find((i) => i.key === value);
  // The one chosen comes first while nothing's typed, so the list opens on it.
  const list = useMemo(() => {
    const found = items.filter((i) => matches(i, term));
    if (term.trim() || !chosen) return found;
    return [chosen, ...found.filter((i) => i.key !== chosen.key)];
  }, [items, term, chosen, matches]);
  const close = () => {
    setTerm('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={title} scroll={false}>
      <TextField
        icon={Search}
        placeholder={searchLabel}
        accessibilityLabel={searchLabel}
        value={term}
        onChangeText={setTerm}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={desktop}
        testID={testID ? `${testID}-search` : undefined}
      />
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ flexShrink: 1 }}>
        <FlatList
          data={list}
          keyExtractor={(i) => i.key}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          // As tall as fits: shorter while a keyboard is up (the sheet gives way to it).
          style={{ maxHeight: Math.max(240, height * 0.55), flexShrink: 1, marginHorizontal: -20 }}
          renderItem={({ item }) => {
            const on = item.key === value;
            return (
              <ListRow
                left={item.mark ? <MarkText>{item.mark}</MarkText> : undefined}
                title={item.title}
                subtitle={item.subtitle}
                radio
                checked={on}
                selected={on}
                right={on ? <Check size={18} color={t.c.accent} /> : null}
                onPress={() => {
                  onPick(item.key);
                  close();
                }}
                testID={testID ? `${testID}-${item.key}` : undefined}
              />
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: 20, gap: 12, alignItems: 'flex-start' }}>
              <Text variant="body" color="textSecondary" accessibilityLiveRegion="polite">
                {failed
                  ? tr('The list didn’t load. Check your connection and try again.')
                  : loading
                    ? tr('Loading…')
                    : empty}
              </Text>
              {failed && onRetry ? (
                <Button
                  label={tr('Try again')}
                  variant="secondary"
                  onPress={onRetry}
                  testID={testID ? `${testID}-retry` : undefined}
                />
              ) : null}
            </View>
          }
        />
      </View>
    </Sheet>
  );
}

function MarkText({ children }: { children: ReactNode }) {
  return (
    <Text
      variant="title"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: 32, textAlign: 'center' }}
    >
      {children}
    </Text>
  );
}
