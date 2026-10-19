/**
 * Everything shared in a conversation (PRD §26), without scrolling back for it: photos and
 * videos, files and voice notes, and links, newest first, a page at a time. A photo or a file
 * opens from here, a link is checked before it opens (PRD §60), each can be shown where it was
 * shared, and each saved on its own to a collection (PRD §69). What someone deleted for
 * themselves isn't here for them (the server leaves it out).
 *
 * The same place across conversations (M16 H6): the files between you and someone (the person's
 * page), and a space's (its page), each saying who shared it and in which topic or conversation,
 * opening there. A file of your own can be shared by a link (`FileLinkSheet`), for someone who
 * isn't in the conversation.
 */
import type { AssetView, ConversationView, FileView } from '@caime/core/api';
import { formatBytes, formatDuration, formatListTime } from '@caime/core/format';
import { listed, msg, tr } from '@caime/core/i18n';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Bookmark from 'lucide-react-native/icons/bookmark';
import FileText from 'lucide-react-native/icons/file-text';
import Link from 'lucide-react-native/icons/link';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Mic from 'lucide-react-native/icons/mic';
import Share2 from 'lucide-react-native/icons/share-2';
import Video from 'lucide-react-native/icons/video';
import { useState } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useAssets } from '@/api/hooks';
import { PhotoViewerHost } from '@/features/media/PhotoViewerHost';
import { drawable, showPhotos } from '@/features/media/viewer';
import { openCheckedLink } from '@/lib/links';
import { openFile } from '@/lib/openFile';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Segmented } from '@/ui/Segmented';
import { afterSheet, Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { mayKeepFrom } from './mayKeep';

type Tab = 'media' | 'files' | 'links';

/** Saving to a collection: loaded when it's asked for, as from a message's actions. */
const SaveSheet = lazyPart(() => import('@/features/saved/SaveSheet').then((m) => m.SaveSheet));
/** A link to one of your files (M16 H6): loaded when one is asked for. */
const FileLinkSheet = lazyPart(() =>
  import('@/features/files/FileLinkSheet').then((m) => m.FileLinkSheet),
);

/** Whose files: one conversation's, or across a person's or a space's conversations (M16 H6). */
export type SharedSource =
  | { kind: 'conversation'; conversation: ConversationView }
  | { kind: 'person' | 'space'; id: string; name: string };

const TABS: ReadonlyArray<{ value: Tab; label: string; kinds: readonly AssetView['kind'][] }> = [
  { value: 'media', label: msg('Photos'), kinds: ['photo', 'video'] },
  { value: 'files', label: msg('Files'), kinds: ['document', 'audio'] },
  { value: 'links', label: msg('Links'), kinds: ['link'] },
];

const EMPTY: Record<Tab, string> = {
  media: msg('No photos or videos shared here yet.'),
  files: msg('No files shared here yet.'),
  links: msg('No links shared here yet.'),
};

export function SharedFiles({
  source,
  onClose,
  onJump,
}: {
  source: SharedSource;
  onClose: () => void;
  /** Show the message something came in; absent where the conversation isn't on screen. */
  onJump?: (seq: number) => void;
}) {
  const conversation = source.kind === 'conversation' ? source.conversation : null;
  const t = useTheme();
  const me = useSession((s) => s.user?.id ?? '');
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // Chosen by them; until then, the first kind there's anything of.
  const [chosen, setChosen] = useState<Tab | null>(null);
  // The one being saved, in place of this sheet while it is: this sheet closes, and the saving
  // one opens once it has gone (Sheet's `afterSheet`).
  const [toKeep, setToKeep] = useState<AssetView | null>(null);
  const [keeping, setKeeping] = useState<AssetView | null>(null);
  const keep = (a: AssetView) => {
    setToKeep(a);
    afterSheet(() => setKeeping(a));
  };
  // A file given out by a link, the same way: this sheet closes and the link's opens.
  const [linking, setLinking] = useState<FileView | null>(null);
  const linkTo = (a: AssetView) => {
    if (!a.file) return;
    const file = a.file;
    setToKeep(a);
    afterSheet(() => setLinking(file));
  };
  const [first, setFirst] = useState<Tab>('media');
  const tab = chosen ?? first;
  const shown = TABS.find((x) => x.value === tab) ?? TABS[0]!;
  const q = useAssets(
    source.kind === 'conversation'
      ? { kind: 'conversation', id: source.conversation.id }
      : { kind: source.kind, id: source.id },
    tab,
    shown.kinds,
  );
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
    if (a.senderId === me) return tr('You');
    if (!conversation) return a.senderName;
    const org = conversation.business?.org;
    if (org && a.senderId === org.id) return org.name;
    return (
      conversation.participants.find((p) => p.userId === a.senderId)?.person.displayName ?? null
    );
  };
  // Who, where (a topic, a space's conversation), when, and what more.
  const line = (a: AssetView, detail?: string | null) =>
    [who(a), a.where, formatListTime(a.createdAt, now, timeZone, locale), detail]
      .filter(Boolean)
      .join(' · ');
  // In the conversation on screen, its own way; from a person's or a space's place, to the
  // conversation it's in, at the message.
  const jump = conversation
    ? onJump &&
      ((a: AssetView) => {
        if (a.messageSeq === null) return;
        onClose();
        onJump(a.messageSeq);
      })
    : (a: AssetView) => {
        if (a.messageSeq === null) return;
        onClose();
        router.navigate({
          pathname: '/c/[id]',
          params: { id: a.conversationId, seq: String(a.messageSeq) },
        });
      };
  // Photos open full screen in Caime, a swipe from the others shown (R88); anything else opens
  // with the session (a phone's system sheet, a browser's tab).
  const photos = assets.flatMap((a) =>
    a.kind === 'photo' && a.file && drawable(a.file) ? [a.file] : [],
  );
  const openAsset = (a: AssetView) => {
    if (!a.file) return;
    const at = photos.findIndex((f) => f.id === a.file?.id);
    if (at >= 0) showPhotos(photos, at, 'shared');
    else void openFile(a.file).catch((e: Error) => toast(e.message, { tone: 'danger' }));
  };
  // Across conversations the server lists only what may be kept (never a private one's, nor a
  // request's still waiting).
  const mayKeep = conversation ? mayKeepFrom(conversation) : true;
  const linkIt = (a: AssetView) =>
    a.linkable && a.file ? (
      <IconButton
        icon={Share2}
        label={tr('Share by link')}
        size={18}
        onPress={() => linkTo(a)}
        testID="shared-link-file"
      />
    ) : null;
  const keepIt = (a: AssetView) =>
    mayKeep && a.messageId ? (
      <IconButton
        icon={Bookmark}
        label={tr('Save it')}
        size={18}
        onPress={() => keep(a)}
        testID="shared-save"
      />
    ) : null;
  const showIt = (a: AssetView) =>
    jump && a.messageSeq !== null ? (
      <IconButton
        icon={MessageCircle}
        label={tr('Show in the conversation')}
        size={18}
        onPress={() => jump(a)}
        testID="shared-jump"
      />
    ) : null;

  return (
    <>
      {keeping?.messageId ? (
        <SaveSheet
          messageId={keeping.messageId}
          assetId={keeping.id}
          onClose={() => {
            setKeeping(null);
            setToKeep(null);
          }}
        />
      ) : null}
      {linking ? (
        <FileLinkSheet
          file={linking}
          onClose={() => {
            setLinking(null);
            setToKeep(null);
          }}
        />
      ) : null}
      <Sheet
        open={!toKeep}
        onClose={onClose}
        title={
          source.kind === 'conversation'
            ? tr('Shared here')
            : source.kind === 'person'
              ? tr('Between you and {name}', { name: source.name })
              : tr('Shared in {name}', { name: source.name })
        }
      >
        {/* Opened from this sheet, a photo shows over it (R88). */}
        <PhotoViewerHost host="shared" />
        <View style={{ gap: 12 }}>
          <Segmented
            label={tr('What’s shown')}
            value={tab}
            options={TABS.map((x) => ({ value: x.value, label: tr(x.label), count: count(x) }))}
            onChange={setChosen}
          />
          {q.isError ? (
            <Text variant="body" color="danger">
              {(q.error as Error).message}
            </Text>
          ) : loading ? (
            <Text variant="body" color="textSecondary">
              {tr('Loading what’s been shared…')}
            </Text>
          ) : !assets.length ? (
            <Text variant="body" color="textSecondary" testID="shared-empty">
              {tr(EMPTY[tab])}
            </Text>
          ) : tab === 'media' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -2 }}>
              {assets.map((a) => {
                const thumb = mediaUrl(
                  a.file?.thumbUrl ?? (a.kind === 'photo' ? a.file?.url : null),
                );
                const video = a.kind === 'video';
                const what = video ? tr('Video') : tr('Photo');
                const duration =
                  video && a.file?.durationMs ? formatDuration(a.file.durationMs) : null;
                return (
                  <View key={a.id} style={{ width: '33.333%', aspectRatio: 1, padding: 2 }}>
                    <Pressable
                      accessibilityRole="imagebutton"
                      accessibilityLabel={listed([what, a.file?.name, duration, line(a)])}
                      onPress={() => openAsset(a)}
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
                        accessibilityLabel={
                          video
                            ? tr('Show this video in the conversation')
                            : tr('Show this photo in the conversation')
                        }
                        onPress={() => jump(a)}
                        hitSlop={8}
                        focusRadius={14}
                        style={{
                          position: 'absolute',
                          top: 8,
                          end: 8,
                          width: 28,
                          height: 28,
                          borderRadius: t.radii.md,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        testID="shared-jump"
                      >
                        <MessageCircle size={15} color="#fff" />
                      </Pressable>
                    ) : null}
                    {a.linkable && a.file ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={tr('Share by link')}
                        onPress={() => linkTo(a)}
                        hitSlop={8}
                        focusRadius={14}
                        style={{
                          position: 'absolute',
                          bottom: 8,
                          end: 8,
                          width: 28,
                          height: 28,
                          borderRadius: t.radii.md,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        testID="shared-link-file"
                      >
                        <Share2 size={15} color="#fff" />
                      </Pressable>
                    ) : null}
                    {mayKeep && a.messageId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={video ? tr('Save this video') : tr('Save this photo')}
                        onPress={() => keep(a)}
                        hitSlop={8}
                        focusRadius={14}
                        style={{
                          position: 'absolute',
                          top: 8,
                          start: 8,
                          width: 28,
                          height: 28,
                          borderRadius: t.radii.md,
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
                          a.file?.name ??
                          a.title ??
                          (a.kind === 'audio' ? tr('Voice note') : tr('File'))
                        }
                        subtitle={line(a, a.file ? formatBytes(a.file.size) : null)}
                        onPress={() => openAsset(a)}
                      />
                    ) : (
                      <ListRow
                        icon={Link}
                        title={a.host ?? a.url ?? tr('Link')}
                        subtitle={line(a, a.url)}
                        onPress={() => {
                          if (a.url) void openCheckedLink(a.url);
                        }}
                      />
                    )}
                  </View>
                  {linkIt(a)}
                  {keepIt(a)}
                  {showIt(a)}
                </View>
              ))}
            </View>
          )}
          {q.hasNextPage ? (
            <Button
              label={tr('Show more')}
              variant="secondary"
              loading={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
              testID="shared-more"
            />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
