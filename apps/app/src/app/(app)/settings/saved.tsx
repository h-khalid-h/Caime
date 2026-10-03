/**
 * What's saved (PRD §69): what someone kept by hand from a message's actions, and what their
 * automations kept, in collections of their own. Each opens where it is (a file, a link checked
 * first) and shows where it was said. What's deleted or disappears goes from here too.
 */
import type { SavedItemView } from '@caime/core/api';
import { COLLECTION_MAX, collectionName } from '@caime/core/automations';
import { formatBytes, formatListTime, previewText } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { mediaUrl } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useSaved, useSavedItems } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { openCheckedLink, openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Bookmark, FileText, ImageIcon, Link, MessageCircle, Mic, Trash, Zap } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

function SavedItem({ item, onRemoved }: { item: SavedItemView; onRemoved: () => void }) {
  const t = useTheme();
  const me = useSession((s) => s.user?.id ?? '');
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const from = item.message.senderId === me ? 'You' : (item.message.senderName ?? 'Someone');
  const where = item.conversation.title
    ? tr(' in {title}', { title: item.conversation.title })
    : '';
  const when = formatListTime(item.message.createdAt, now, timeZone, locale);
  const remove = async () => {
    try {
      await endpoints.unsave(item.id);
      onRemoved();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <View
      style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.border }}
      testID="saved-item"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <Text variant="captionStrong" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
          {`${from}${where} · ${when}`}
        </Text>
        <IconButton
          icon={MessageCircle}
          label={tr('Show in the conversation')}
          size={18}
          onPress={() =>
            router.navigate({
              pathname: '/c/[id]',
              params: { id: item.conversation.id, seq: String(item.message.seq) },
            })
          }
          testID="saved-jump"
        />
        <IconButton
          icon={Trash}
          label={tr('Remove from saved')}
          size={18}
          onPress={() => void remove()}
          testID="saved-remove"
        />
      </View>
      {item.message.body && !item.link ? (
        <Text variant="body" style={{ paddingHorizontal: 16 }} numberOfLines={4}>
          {previewText(item.message.body, 280)}
        </Text>
      ) : null}
      {item.files.map((f) => (
        <ListRow
          key={f.id}
          icon={
            f.kind === 'image' || f.kind === 'video'
              ? ImageIcon
              : f.kind === 'audio'
                ? Mic
                : FileText
          }
          title={f.name}
          subtitle={formatBytes(f.size)}
          onPress={() => {
            const url = mediaUrl(f.url);
            if (url) openLink(url);
          }}
          testID="saved-file"
        />
      ))}
      {item.link ? (
        <ListRow
          icon={Link}
          title={item.link.title ?? item.link.host ?? item.link.url}
          subtitle={item.link.url}
          onPress={() => {
            if (item.link) void openCheckedLink(item.link.url);
          }}
          testID="saved-link"
        />
      ) : null}
      {item.automationId ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
          <Zap size={12} color={t.c.textTertiary} />
          <Text variant="caption" color="textTertiary">
            {tr('Kept by an automation')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function Saved() {
  const qc = useQueryClient();
  const collections = useSaved();
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const items = useSavedItems(chosen);
  const list = collections.data?.collections ?? [];
  const shown = items.data?.pages.flatMap((p) => p.items) ?? [];
  const current = list.find((c) => c.name === chosen);
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.saved });
  const rename = async () => {
    if (!chosen || renaming === null) return;
    setBusy(true);
    try {
      const { collection } = await endpoints.renameCollection(chosen, collectionName(renaming));
      setChosen(collection);
      setRenaming(null);
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const empty = async () => {
    if (!chosen) return;
    try {
      await endpoints.deleteCollection(chosen);
      setEmptying(false);
      setChosen(undefined);
      refresh();
      toast(tr('{chosen} is empty now', { chosen }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  return (
    <SettingsPage title={tr('Saved')}>
      <Text variant="body" color="textSecondary">
        {tr(
          'What you save from a message, and what your automations keep, stays here for as long as the message does.',
        )}
      </Text>
      {list.length ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          accessibilityLabel={tr('Collections')}
        >
          <Chip
            label={tr('Everything')}
            selected={chosen === undefined}
            onPress={() => setChosen(undefined)}
            testID="saved-all"
          />
          {list.map((c) => (
            <Chip
              key={c.name}
              label={`${c.name} · ${c.count}`}
              icon={c.automations ? Zap : Bookmark}
              selected={chosen === c.name}
              onPress={() => {
                setChosen(c.name);
                setEmptying(false);
              }}
              testID="saved-collection"
            />
          ))}
        </View>
      ) : null}
      {items.isError ? (
        <Text variant="body" color="danger">
          {(items.error as Error).message}
        </Text>
      ) : items.isPending ? (
        <SkeletonRows count={5} />
      ) : !shown.length ? (
        <EmptyState
          icon={Bookmark}
          title={chosen ? tr('Nothing in {chosen} yet', { chosen }) : tr('Nothing saved yet')}
          body={
            current?.automations
              ? tr('An automation saves here as what it looks for arrives.')
              : tr('Save a message from its actions, or set up an automation to keep what arrives.')
          }
          action={
            <Button
              label={tr('Automations')}
              variant="secondary"
              onPress={() => router.navigate('/settings/automations')}
            />
          }
          compact
        />
      ) : (
        <Group>
          <View style={{ marginTop: -1 }}>
            {shown.map((item) => (
              <SavedItem key={item.id} item={item} onRemoved={refresh} />
            ))}
          </View>
        </Group>
      )}
      {items.hasNextPage ? (
        <Button
          label={tr('Show more')}
          variant="secondary"
          loading={items.isFetchingNextPage}
          onPress={() => void items.fetchNextPage()}
          testID="saved-more"
        />
      ) : null}
      {chosen ? (
        // On a phone the confirmation wraps rather than pushing "Keep it" off the screen.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button
            label={tr('Rename')}
            variant="ghost"
            onPress={() => setRenaming(chosen)}
            testID="saved-rename"
          />
          {current?.automations ? null : emptying ? (
            <>
              <Button
                label={tr('Take everything out of {chosen}', { chosen })}
                variant="danger"
                onPress={() => void empty()}
                testID="saved-empty-confirm"
              />
              <Button label={tr('Keep it')} variant="ghost" onPress={() => setEmptying(false)} />
            </>
          ) : (
            <Button
              label={tr('Empty it')}
              variant="ghost"
              onPress={() => setEmptying(true)}
              testID="saved-empty"
            />
          )}
        </View>
      ) : null}
      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={tr('Rename {chosen}', { chosen: chosen ?? '' })}
        subtitle={tr(
          'Its automations save to the new name. Into one you have, the two become one.',
        )}
        footer={
          <Button
            label={tr('Rename')}
            block
            size="lg"
            loading={busy}
            disabled={!renaming?.trim()}
            onPress={() => void rename()}
            testID="saved-rename-save"
          />
        }
      >
        <TextField
          label={tr('Its name')}
          value={renaming ?? ''}
          onChangeText={setRenaming}
          maxLength={COLLECTION_MAX}
          autoFocus
          testID="saved-rename-name"
        />
      </Sheet>
    </SettingsPage>
  );
}
