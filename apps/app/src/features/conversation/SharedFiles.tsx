/**
 * Everything shared in a conversation (PRD §26), without scrolling back for it: photos and
 * videos, files and voice notes, and links, newest first, a page at a time. A photo or a file
 * opens from here, a link is checked before it opens (PRD §60), each can be shown where it was
 * shared, and each saved on its own to a collection (PRD §69). What someone deleted for
 * themselves isn't here for them (the server leaves it out).
 */
import type { AssetView, ConversationView } from '@caime/core/api';
import { formatBytes, formatDuration, formatListTime } from '@caime/core/format';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useAssets } from '@/api/hooks';
import { SaveSheet } from '@/features/saved/SaveSheet';
import { openCheckedLink, openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Bookmark, FileText, Link, MessageCircle, Mic, Video } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

type Tab = 'media' | 'files' | 'links';

const TABS: ReadonlyArray<{ value: Tab; label: string; kinds: readonly AssetView['kind'][] }> = [
  { value: 'media', label: 'Photos', kinds: ['photo', 'video'] },
  { value: 'files', label: 'Files', kinds: ['document', 'audio'] },
  { value: 'links', label: 'Links', kinds: ['link'] },
];

const EMPTY: Record<Tab, string> = {
  media: 'No photos or videos shared here yet.',
  files: 'No files shared here yet.',
  links: 'No links shared here yet.',
};

/**
 * Whether anything of a conversation may be saved (the server's rules): never a private one's,
 * nor a message request's until it's accepted, nor once it's declined.
 */
export function mayKeepFrom(conversation: ConversationView): boolean {
  const state = conversation.me.requestState;
  return conversation.privacyClass !== 'private' && state !== 'pending' && state !== 'declined';
}

export function SharedFiles({
  conversation,
  onClose,
  onJump,
}: {
  conversation: ConversationView;
  onClose: () => void;
  /** Show the message something came in; absent where the conversation isn't on screen. */
  onJump?: (seq: number) => void;
}) {
  const t = useTheme();
  const me = useSession((s) => s.user?.id ?? '');
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // Chosen by them; until then, the first kind there's anything of.
  const [chosen, setChosen] = useState<Tab | null>(null);
  // The one being saved, in place of this sheet while it is.
  const [keeping, setKeeping] = useState<AssetView | null>(null);
  const [first, setFirst] = useState<Tab>('media');
  const tab = chosen ?? first;
  const shown = TABS.find((x) => x.value === tab) ?? TABS[0]!;
  const q = useAssets(conversation.id, tab, shown.kinds);
  const counts = q.data?.pages[0]?.counts ?? {};
  const count = (x: (typeof TABS)[number]) => x.kinds.reduce((n, k) => n + (counts[k] ?? 0), 0);
  // What the last tab showed is only for its counts: never listed under this one.
  const loading = q.isPending || q.isPlaceholderData;
  const assets = loading ? [] : (q.data?.pages.flatMap((p) => p.assets) ?? []);
  if (!chosen && !loading && q.data && !assets.length) {
    const some = TABS.find((x) => count(x) > 0);
    if (some && some.value !== first) setFirst(some.value);
  }

  const who = (a: AssetView): string | null => {
    if (!a.senderId) return null;
    if (a.senderId === me) return 'You';
    const org = conversation.business?.org;
    if (org && a.senderId === org.id) return org.name;
    return (
      conversation.participants.find((p) => p.userId === a.senderId)?.person.displayName ?? null
    );
  };
  const line = (a: AssetView, detail?: string | null) =>
    [who(a), formatListTime(a.createdAt, now, timeZone, locale), detail]
      .filter(Boolean)
      .join(' · ');
  const jump =
    onJump &&
    ((a: AssetView) => {
      if (a.messageSeq === null) return;
      onClose();
      onJump(a.messageSeq);
    });
  const openFile = (a: AssetView) => {
    const url = mediaUrl(a.file?.url);
    if (url) openLink(url);
  };
  const mayKeep = mayKeepFrom(conversation);
  const keepIt = (a: AssetView) =>
    mayKeep && a.messageId ? (
      <IconButton
        icon={Bookmark}
        label="Save it"
        size={18}
        onPress={() => setKeeping(a)}
        testID="shared-save"
      />
    ) : null;
  const showIt = (a: AssetView) =>
    jump && a.messageSeq !== null ? (
      <IconButton
        icon={MessageCircle}
        label="Show in the conversation"
        size={18}
        onPress={() => jump(a)}
        testID="shared-jump"
      />
    ) : null;

  if (keeping?.messageId)
    return (
      <SaveSheet
        messageId={keeping.messageId}
        assetId={keeping.id}
        onClose={() => setKeeping(null)}
      />
    );
  return (
    <Sheet open onClose={onClose} title="Shared here">
      <View style={{ gap: 12 }}>
        <Segmented
          label="What’s shown"
          value={tab}
          options={TABS.map((x) => ({ value: x.value, label: x.label, count: count(x) }))}
          onChange={setChosen}
        />
        {q.isError ? (
          <Text variant="body" color="danger">
            {(q.error as Error).message}
          </Text>
        ) : loading ? (
          <Text variant="body" color="textSecondary">
            Loading what’s been shared…
          </Text>
        ) : !assets.length ? (
          <Text variant="body" color="textSecondary" testID="shared-empty">
            {EMPTY[tab]}
          </Text>
        ) : tab === 'media' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -2 }}>
            {assets.map((a) => {
              const thumb = mediaUrl(a.file?.thumbUrl ?? (a.kind === 'photo' ? a.file?.url : null));
              const video = a.kind === 'video';
              const what = video ? 'Video' : 'Photo';
              const duration =
                video && a.file?.durationMs ? formatDuration(a.file.durationMs) : null;
              return (
                <View key={a.id} style={{ width: '33.333%', aspectRatio: 1, padding: 2 }}>
                  <Pressable
                    accessibilityRole="imagebutton"
                    accessibilityLabel={[what, a.file?.name, duration, line(a)]
                      .filter(Boolean)
                      .join(', ')}
                    onPress={() => openFile(a)}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: t.c.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    testID="shared-photo"
                  >
                    {thumb ? (
                      <Image
                        source={{ uri: thumb, headers: mediaHeaders() }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <Video size={24} color={t.c.textTertiary} />
                    )}
                    {video && (thumb || duration) ? (
                      <View
                        style={{
                          position: 'absolute',
                          start: 6,
                          bottom: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 8,
                          backgroundColor: 'rgba(0,0,0,0.55)',
                        }}
                      >
                        {thumb ? <Video size={12} color="#fff" /> : null}
                        {duration ? (
                          <Text variant="caption" style={{ color: '#fff' }}>
                            {duration}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                  {jump && a.messageSeq !== null ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Show this ${what.toLowerCase()} in the conversation`}
                      onPress={() => jump(a)}
                      hitSlop={8}
                      focusRadius={14}
                      style={{
                        position: 'absolute',
                        top: 8,
                        end: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      testID="shared-jump"
                    >
                      <MessageCircle size={15} color="#fff" />
                    </Pressable>
                  ) : null}
                  {mayKeep && a.messageId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save this ${what.toLowerCase()}`}
                      onPress={() => setKeeping(a)}
                      hitSlop={8}
                      focusRadius={14}
                      style={{
                        position: 'absolute',
                        top: 8,
                        start: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      testID="shared-save"
                    >
                      <Bookmark size={15} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ marginHorizontal: -20 }}>
            {assets.map((a) => (
              // Opening it and showing it in the conversation sit side by side, not one in the
              // other, so each is its own control.
              <View
                key={a.id}
                style={{ flexDirection: 'row', alignItems: 'center', paddingEnd: 8 }}
                testID={tab === 'files' ? 'shared-file' : 'shared-link'}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  {tab === 'files' ? (
                    <ListRow
                      icon={a.kind === 'audio' ? Mic : FileText}
                      title={
                        a.file?.name ?? a.title ?? (a.kind === 'audio' ? 'Voice note' : 'File')
                      }
                      subtitle={line(a, a.file ? formatBytes(a.file.size) : null)}
                      onPress={() => openFile(a)}
                    />
                  ) : (
                    <ListRow
                      icon={Link}
                      title={a.host ?? a.url ?? 'Link'}
                      subtitle={line(a, a.url)}
                      onPress={() => {
                        if (a.url) void openCheckedLink(a.url);
                      }}
                    />
                  )}
                </View>
                {keepIt(a)}
                {showIt(a)}
              </View>
            ))}
          </View>
        )}
        {q.hasNextPage ? (
          <Button
            label="Show more"
            variant="secondary"
            loading={q.isFetchingNextPage}
            onPress={() => void q.fetchNextPage()}
            testID="shared-more"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
