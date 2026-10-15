/**
 * A connected OneDrive, browsed to pick one file for the conversation (R90): its folders, a
 * search, a page at a time, read through Caime's server with the person's own access and kept
 * nowhere. Picking hands the file's id to the composer, which has the server copy it in as the
 * person's upload. Loaded when opened.
 */
import { ACCOUNT_DRIVE_NAMES } from '@caime/core/accounts';
import type { AccountFileView, ConnectedAccountView } from '@caime/core/api';
import { formatBytes, formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useInfiniteQuery } from '@tanstack/react-query';
import FileText from 'lucide-react-native/icons/file-text';
import Folder from 'lucide-react-native/icons/folder';
import Search from 'lucide-react-native/icons/search';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Back } from '@/ui/directional';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export interface DriveSheetProps {
  account: ConnectedAccountView;
  open: boolean;
  onClose: () => void;
  onPick: (file: AccountFileView) => void;
}

export default function DriveSheet({ account, open, onClose, onPick }: DriveSheetProps) {
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // The folders walked into, the top first; none is the drive's top.
  const [trail, setTrail] = useState<AccountFileView[]>([]);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  // A search is asked for once typing settles, never a request per key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 400);
    return () => clearTimeout(t);
  }, [typed]);
  const folder = trail.at(-1)?.id ?? null;
  const q = useInfiniteQuery({
    queryKey: qk.accountFiles(account.id, folder, search),
    queryFn: ({ pageParam }) =>
      endpoints.accountFiles(account.id, {
        ...(pageParam ? { next: pageParam } : {}),
        ...(!pageParam && folder ? { folder } : {}),
        ...(!pageParam && search ? { q: search } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: open,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const where = trail.at(-1)?.name ?? ACCOUNT_DRIVE_NAMES.microsoft;
  return (
    <Sheet open={open} onClose={onClose} title={where} subtitle={account.email ?? undefined} scroll>
      <View style={{ gap: 12 }}>
        <TextField
          icon={Search}
          value={typed}
          onChangeText={setTyped}
          placeholder={tr('Search {where}', { where })}
          accessibilityLabel={tr('Search {where}', { where })}
          testID="drive-search"
        />
        <View style={{ marginHorizontal: -20 }}>
          {trail.length > 0 ? (
            <ListRow
              icon={Back}
              title={trail.length > 1 ? (trail.at(-2)?.name ?? '') : ACCOUNT_DRIVE_NAMES.microsoft}
              subtitle={tr('Back')}
              onPress={() => setTrail(trail.slice(0, -1))}
              testID="drive-up"
            />
          ) : null}
          {q.isPending ? (
            <SkeletonRows />
          ) : q.isError ? (
            <Text variant="body" color="danger" style={{ padding: 20 }} testID="drive-failed">
              {(q.error as Error).message}
            </Text>
          ) : items.length === 0 ? (
            <Text variant="body" color="textSecondary" style={{ padding: 20 }} testID="drive-empty">
              {search ? tr('Nothing here matches that.') : tr('This folder is empty.')}
            </Text>
          ) : (
            items.map((f) => (
              <ListRow
                key={f.id}
                icon={f.folder ? Folder : FileText}
                title={f.name}
                subtitle={
                  f.folder
                    ? tr('Folder')
                    : [
                        f.size !== null ? formatBytes(f.size) : null,
                        f.modifiedAt ? formatWhen(f.modifiedAt, now, timeZone, locale) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                }
                chevron={f.folder}
                onPress={() => {
                  if (f.folder) {
                    setTrail([...trail, f]);
                    setTyped('');
                    setSearch('');
                  } else onPick(f);
                }}
                testID={`drive-item-${f.name}`}
              />
            ))
          )}
        </View>
        {q.hasNextPage ? (
          <Button
            label={tr('Show more')}
            size="sm"
            variant="secondary"
            loading={q.isFetchingNextPage}
            onPress={() => void q.fetchNextPage()}
            testID="drive-more"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
