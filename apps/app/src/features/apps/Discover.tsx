/**
 * Discover (R74): the apps someone can connect to Caime, Caime's own first, then developers'
 * listed apps by how many connected them, a page at a time (a keyset page from the server, so
 * thousands cost what twenty do), narrowed by a search and a category.
 */
import type { DirectoryAppView } from '@caime/core/api';
import { APP_CATEGORIES, APP_CATEGORY_LABELS, type AppCategory } from '@caime/core/app-directory';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import Search from 'lucide-react-native/icons/search';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useDirectory, useDirectoryApp } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Group } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { Chip, ChoiceChips } from '@/ui/Chip';
import { ListRow } from '@/ui/ListRow';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { AppIcon } from './AppIcon';
import { AppSheet } from './AppSheet';

type Pick = 'all' | AppCategory;

/** What a row says under the name: the tagline, else who published it. */
const line = (a: DirectoryAppView) => a.tagline ?? tr('By {name}', { name: a.publisher.name });

export function Discover({ openApp }: { openApp?: string }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState<Pick>('all');
  const [openId, setOpenId] = useState<string | null>(openApp ?? null);
  // The server is asked once the typing settles, never on every key.
  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);
  const q = useDirectory(search, pick === 'all' ? null : pick);
  const apps = q.data?.pages.flatMap((p) => p.apps) ?? [];
  const inList = apps.find((a) => a.id === openId) ?? null;
  // Opened by a link (`?app=`) before its page is here: asked for on its own.
  const alone = useDirectoryApp(openId && !inList ? openId : null);
  const open = inList ?? (openId ? (alone.data?.app ?? null) : null);
  const close = () => {
    setOpenId(null);
    // Connecting happened in the app's own tab: what's connected is read again.
    void qc.invalidateQueries({ queryKey: qk.connectedApps });
    void qc.invalidateQueries({ queryKey: qk.allDirectory });
  };
  return (
    <>
      <View style={{ gap: 12 }}>
        <TextField
          icon={Search}
          value={typed}
          onChangeText={setTyped}
          placeholder={tr('Search apps')}
          accessibilityLabel={tr('Search apps')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => setSearch(typed.trim())}
          testID="discover-search"
        />
        <ChoiceChips<Pick>
          label={tr('Category')}
          value={pick}
          onChange={setPick}
          wrap
          options={[
            { value: 'all', label: tr('All'), testID: 'discover-category-all' },
            ...APP_CATEGORIES.map((c) => ({
              value: c,
              label: tr(APP_CATEGORY_LABELS[c]),
              testID: `discover-category-${c}`,
            })),
          ]}
        />
      </View>
      <Group
        footer={tr(
          'Apps are made by developers and looked at once by Caime before they’re listed. Each reaches only what you allow it, never your password, privacy or account.',
        )}
      >
        {q.isPending ? (
          <SkeletonRows />
        ) : apps.length === 0 ? (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }} testID="discover-none">
            {search || pick !== 'all' ? tr('No app matches that.') : tr('No apps are listed yet.')}
          </Text>
        ) : (
          apps.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <Divider inset={68} /> : null}
              <ListRow
                left={<AppIcon url={a.iconUrl} appId={a.id} name={a.name} />}
                title={a.name}
                subtitle={line(a)}
                right={
                  a.connected ? (
                    <Chip label={tr('Connected')} tone="success" size="sm" />
                  ) : undefined
                }
                chevron={!a.connected}
                onPress={() => setOpenId(a.id)}
                testID={`discover-${a.id}`}
              />
            </View>
          ))
        )}
        {q.hasNextPage ? (
          <>
            <Divider />
            <Button
              label={tr('Show more')}
              variant="ghost"
              size="sm"
              loading={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
              testID="discover-more"
            />
          </>
        ) : null}
      </Group>
      <AppSheet app={open} onClose={close} />
    </>
  );
}
