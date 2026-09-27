import type { AlbumPhotoView, AlbumView, FileView, MessageView } from '@caishy/core/api';
import { kitMoves, kitStateLabel } from '@caishy/core/kit-cards';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { uploadFile } from '@/api/upload';
import { openLink } from '@/lib/links';
import { pickFromLibrary } from '@/lib/photos';
import { upsertMessage } from '@/state/cache';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Images, Plus, X } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

interface AlbumPayload {
  label?: string;
  title?: string;
  state?: string;
}

const TILE = 72;

function Photo({ f, size, label }: { f: FileView; size: number; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      onPress={() => openLink(mediaUrl(f.url) ?? '')}
    >
      <Image
        source={{ uri: mediaUrl(f.thumbUrl ?? f.url) ?? undefined, headers: mediaHeaders() }}
        style={{ width: size, height: size, borderRadius: 10, backgroundColor: t.c.surfaceMuted }}
        contentFit="cover"
        transition={150}
      />
    </Pressable>
  );
}

/** Everything in the album, newest first; your own photos (or all, if it's yours) can go. */
function AlbumSheet({
  m,
  mine,
  open,
  onClose,
}: {
  m: MessageView;
  mine: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const p = (m.payload ?? {}) as AlbumPayload;
  const q = useQuery({
    queryKey: qk.album(m.id),
    queryFn: () => endpoints.album(m.id),
    enabled: open,
  });
  const change = async (write: () => Promise<{ message: MessageView }>) => {
    try {
      upsertMessage(qc, (await write()).message);
      void qc.invalidateQueries({ queryKey: qk.album(m.id) });
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      return false;
    }
  };
  // Your own photo can go back in; someone else's is theirs to add again.
  const remove = async (ph: AlbumPhotoView) => {
    if (!(await change(() => endpoints.removeFromAlbum(m.id, ph.file.id)))) return;
    toast(
      'Taken out of the album',
      ph.addedBy === me.id
        ? {
            action: {
              label: 'Undo',
              onPress: () => void change(() => endpoints.addToAlbum(m.id, [ph.file.id])),
            },
          }
        : {},
    );
  };
  const photos = q.data?.photos ?? [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={p.title ?? 'Album'}
      subtitle={`${m.album?.count ?? photos.length} photo${(m.album?.count ?? photos.length) === 1 ? '' : 's'}`}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID="album-sheet-photos">
        {photos.map((ph, i) => (
          <View key={ph.file.id}>
            <Photo f={ph.file} size={104} label={`Photo ${i + 1} of ${photos.length}`} />
            {mine || ph.addedBy === me.id ? (
              <View style={{ position: 'absolute', top: 6, right: 6 }}>
                <IconButton
                  icon={X}
                  size={16}
                  color="#FFFFFF"
                  hitSlop={6}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                  }}
                  label={`Take photo ${i + 1} out of the album`}
                  onPress={() => void remove(ph)}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/**
 * A shared album (PRD §41): everyone in the conversation adds photos to one card, and sees them
 * there, newest first. Whoever made it closes it when it's full.
 */
export function AlbumCard({ m, mine }: { m: MessageView; mine: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const p = (m.payload ?? {}) as AlbumPayload;
  const album: AlbumView = m.album ?? { count: 0, photos: [] };
  const open = p.state !== 'closed' && !m.deletedAt;
  const moves = m.deletedAt ? [] : kitMoves('shared_album', p.state ?? 'open', mine);
  const more = album.count - album.photos.length;

  const add = async () => {
    const res = await pickFromLibrary({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.9,
    });
    if (res.canceled || !res.assets.length) return;
    setAdding(res.assets.length === 1 ? 'Adding a photo…' : `Adding ${res.assets.length} photos…`);
    try {
      const ids: string[] = [];
      for (const [i, a] of res.assets.entries()) {
        const f = await uploadFile({
          uri: a.uri,
          name: a.fileName ?? `photo-${i + 1}.jpg`,
          mime: a.mimeType ?? 'image/jpeg',
          file: (a as { file?: Blob }).file,
        });
        ids.push(f.id);
      }
      upsertMessage(qc, (await endpoints.addToAlbum(m.id, ids)).message);
      void qc.invalidateQueries({ queryKey: qk.album(m.id) });
    } catch (e) {
      toast(`Couldn’t add them: ${(e as Error).message}`, { tone: 'danger' });
    } finally {
      setAdding(null);
    }
  };

  const move = async (to: string) => {
    setMoving(to);
    try {
      upsertMessage(qc, (await endpoints.moveKit(m.id, to)).message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setMoving(null);
    }
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID="kit-shared_album">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Images size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {p.label ?? 'Album'}
        </Text>
        <Chip
          label={
            open ? `${album.count} photo${album.count === 1 ? '' : 's'}` : kitStateLabel('closed')
          }
          tone="neutral"
          size="sm"
        />
      </View>
      <Text variant="bodyStrong">{p.title}</Text>
      {album.photos.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`See all ${album.count} photos in ${p.title ?? 'the album'}`}
          onPress={() => setAll(true)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
          testID="album-preview"
        >
          {album.photos.map((f, i) => (
            <View key={f.id}>
              <Image
                source={{
                  uri: mediaUrl(f.thumbUrl ?? f.url) ?? undefined,
                  headers: mediaHeaders(),
                }}
                style={{
                  width: TILE,
                  height: TILE,
                  borderRadius: 10,
                  backgroundColor: t.c.surfaceMuted,
                }}
                contentFit="cover"
                transition={150}
              />
              {more > 0 && i === album.photos.length - 1 ? (
                <View
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 10,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="label" color="#FFFFFF">{`+${more}`}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Pressable>
      ) : (
        <Text variant="caption" color="textSecondary">
          {open ? 'Nothing in it yet. Everyone here can add photos.' : 'Nothing was added.'}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {open ? (
          <Button
            label={adding ?? 'Add photos'}
            icon={Plus}
            size="sm"
            loading={adding !== null}
            onPress={() => void add()}
            testID="album-add"
          />
        ) : null}
        {moves.map((mv) => (
          <Button
            key={mv.to}
            label={mv.label}
            size="sm"
            variant="secondary"
            loading={moving === mv.to}
            onPress={() => void move(mv.to)}
          />
        ))}
      </View>
      <AlbumSheet m={m} mine={mine} open={all} onClose={() => setAll(false)} />
    </View>
  );
}
