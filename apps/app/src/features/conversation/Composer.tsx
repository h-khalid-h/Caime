import type { ConversationView, MessageView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { type LocalFile, uploadFile } from '@/api/upload';
import { STICKER_PACK } from '@/features/stickers/pack';
import { StickerPicker } from '@/features/stickers/StickerPicker';
import { realtime } from '@/realtime/client';
import { applyEditToInbox, upsertMessage } from '@/state/cache';
import { useDrafts } from '@/state/drafts';
import { useOutbox } from '@/state/outbox';
import { fontFamily } from '@/theme/fonts';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { IconButton } from '@/ui/IconButton';
import {
  FileText,
  ImageIcon,
  Paperclip,
  Pencil,
  Reply,
  SendHorizontal,
  Sticker,
  X,
} from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export interface ComposerHandle {
  focus: () => void;
}

export interface ComposerProps {
  conversation: ConversationView;
  replyTo: MessageView | null;
  onClearReply: () => void;
  editing: MessageView | null;
  onDoneEditing: () => void;
  disabled?: string | null;
  replyName?: string | null;
  /** ↑ in an empty box: edit the last message you sent (web). */
  onEditLast?: () => void;
}

const MIN_H = 44;
const MAX_H = 150;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { conversation, replyTo, onClearReply, editing, onDoneEditing, disabled, replyName, onEditLast },
  ref,
) {
  const t = useTheme();
  const qc = useQueryClient();
  const id = conversation.id;
  const stored = useDrafts((s) => s.drafts[id]);
  const [text, setText] = useState(() => stored ?? conversation.me.draft ?? '');
  const [height, setHeight] = useState(MIN_H);
  const [stickers, setStickers] = useState(false);
  const [attach, setAttach] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const enterPref = usePrefs((p) => p.enterToSend);
  const enterSends = enterPref ?? Platform.OS === 'web';

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  // Entering edit mode loads the message's text; leaving restores the draft.
  const value = editing ? (editText ?? editing.body ?? '') : text;

  const onChange = (v: string) => {
    if (editing) {
      setEditText(v);
      return;
    }
    setText(v);
    useDrafts.getState().set(id, v);
    if (v.trim()) realtime.typing(id);
  };

  const send = useCallback(async () => {
    if (disabled) return;
    if (editing) {
      const body = (editText ?? editing.body ?? '').trim();
      if (!body || body === editing.body) {
        setEditText(null);
        onDoneEditing();
        return;
      }
      try {
        const res = await endpoints.editMessage(editing.id, body);
        upsertMessage(qc, res.message);
        applyEditToInbox(qc, res.message);
      } catch (e) {
        toast((e as Error).message, { tone: 'danger' });
      }
      setEditText(null);
      onDoneEditing();
      return;
    }
    const body = text.trim();
    if (!body) return;
    useOutbox.getState().enqueue(
      id,
      { kind: 'text', body, replyToId: replyTo?.id ?? null },
      replyTo
        ? {
            id: replyTo.id,
            seq: replyTo.seq,
            senderId: replyTo.senderId,
            preview: replyTo.body ?? '',
            kind: replyTo.kind,
          }
        : null,
    );
    setText('');
    setHeight(MIN_H);
    useDrafts.getState().clear(id);
    onClearReply();
    input.current?.focus();
  }, [disabled, editing, editText, text, id, replyTo, onClearReply, onDoneEditing, qc]);

  const sendFiles = async (files: LocalFile[], kind: 'media' | 'file') => {
    setUploading(files.length === 1 ? files[0]!.name : `${files.length} files`);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadFile(f));
      useOutbox.getState().enqueue(id, {
        kind,
        body: text.trim() || null,
        fileIds: uploaded.map((u) => u.id),
        replyToId: replyTo?.id ?? null,
      });
      if (text.trim()) {
        setText('');
        useDrafts.getState().clear(id);
      }
      onClearReply();
    } catch (e) {
      toast(`Couldn’t upload: ${(e as Error).message}`, { tone: 'danger' });
    } finally {
      setUploading(null);
    }
  };

  const pickPhotos = async () => {
    setAttach(false);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.9,
    });
    if (res.canceled) return;
    await sendFiles(
      res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `photo-${i + 1}.jpg`,
        mime: a.mimeType ?? 'image/jpeg',
        file: (a as { file?: Blob }).file,
      })),
      'media',
    );
  };

  const pickFiles = async () => {
    setAttach(false);
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    await sendFiles(
      res.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mime: a.mimeType ?? 'application/octet-stream',
        file: (a as { file?: Blob }).file,
      })),
      'file',
    );
  };

  if (disabled) {
    return (
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: t.c.border,
          backgroundColor: t.c.surface,
        }}
      >
        <Text variant="body" color="textSecondary" align="center">
          {disabled}
        </Text>
      </View>
    );
  }

  const canSend = value.trim().length > 0;
  const banner = editing ? (
    <Banner
      icon={Pencil}
      title="Editing message"
      body={editing.body ?? ''}
      onClose={() => {
        setEditText(null);
        onDoneEditing();
      }}
    />
  ) : replyTo ? (
    <Banner
      icon={Reply}
      title={`Replying to ${replyName ?? 'message'}`}
      body={replyTo.body ?? replyTo.kind}
      onClose={onClearReply}
    />
  ) : uploading ? (
    <Banner icon={Paperclip} title="Uploading" body={uploading} />
  ) : null;

  return (
    <View style={{ backgroundColor: t.c.surface, borderTopWidth: 1, borderTopColor: t.c.border }}>
      {banner}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
          paddingHorizontal: 6,
          paddingVertical: 6,
        }}
      >
        <IconButton
          icon={Paperclip}
          label="Attach a photo or file"
          onPress={() => setAttach(true)}
          disabled={Boolean(editing)}
        />
        <View
          style={{
            flex: 1,
            minHeight: MIN_H,
            borderRadius: 22,
            backgroundColor: t.c.surfaceMuted,
            paddingHorizontal: 14,
            justifyContent: 'center',
          }}
        >
          <TextInput
            ref={input}
            testID="composer-input"
            accessibilityLabel={editing ? 'Edit message' : `Message ${conversation.title}`}
            placeholder={editing ? 'Edit message' : 'Message'}
            placeholderTextColor={t.c.textTertiary}
            value={value}
            onChangeText={onChange}
            multiline
            onContentSizeChange={(e) =>
              setHeight(Math.min(MAX_H, Math.max(MIN_H - 12, e.nativeEvent.contentSize.height)))
            }
            onKeyPress={(e) => {
              if (Platform.OS !== 'web') return;
              const ne = e.nativeEvent as unknown as {
                key: string;
                shiftKey?: boolean;
                altKey?: boolean;
                ctrlKey?: boolean;
                metaKey?: boolean;
                isComposing?: boolean;
              };
              const plain = !ne.shiftKey && !ne.altKey && !ne.ctrlKey && !ne.metaKey;
              if (ne.key === 'Enter' && enterSends && !ne.shiftKey && !ne.isComposing) {
                e.preventDefault();
                void send();
              }
              if (ne.key === 'ArrowUp' && plain && !value && !editing && onEditLast) {
                e.preventDefault();
                onEditLast();
              }
              if (ne.key === 'Escape') {
                if (editing) {
                  setEditText(null);
                  onDoneEditing();
                } else if (replyTo) onClearReply();
              }
            }}
            style={[
              {
                color: t.c.text,
                fontFamily: fontFamily('body', 400),
                fontSize: 16,
                lineHeight: 22,
                paddingTop: 10,
                paddingBottom: 10,
                height: Platform.OS === 'web' ? Math.max(MIN_H - 12, height) : undefined,
                maxHeight: MAX_H,
              },
              { outlineStyle: 'none' } as object,
            ]}
          />
        </View>
        {canSend ? (
          <IconButton
            icon={SendHorizontal}
            label={editing ? 'Save' : 'Send'}
            tone="primary"
            onPress={() => void send()}
            testID="composer-send"
          />
        ) : (
          <IconButton
            icon={Sticker}
            label="Stickers"
            onPress={() => setStickers(true)}
            disabled={Boolean(editing)}
          />
        )}
      </View>
      <StickerPicker
        open={stickers}
        onClose={() => setStickers(false)}
        onPick={(s) =>
          useOutbox
            .getState()
            .enqueue(id, { kind: 'sticker', payload: { pack: STICKER_PACK, sticker: s.id } })
        }
      />
      <Sheet open={attach} onClose={() => setAttach(false)} title="Share">
        <View style={{ marginHorizontal: -20 }}>
          <ListRow
            icon={ImageIcon}
            title="Photos"
            subtitle="Location data is removed before anyone sees them"
            onPress={() => void pickPhotos()}
          />
          <ListRow
            icon={FileText}
            title="A file"
            subtitle="Documents, PDFs, anything up to 100 MB"
            onPress={() => void pickFiles()}
          />
        </View>
      </Sheet>
    </View>
  );
});

function Banner({
  icon: Icon,
  title,
  body,
  onClose,
}: {
  icon: typeof Reply;
  title: string;
  body: string;
  onClose?: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 16,
        paddingRight: 6,
        paddingTop: 8,
      }}
    >
      <Icon size={16} color={t.c.accentStrong} />
      <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: t.c.accent, paddingLeft: 8 }}>
        <Text variant="captionStrong" color="accentStrong">
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {body}
        </Text>
      </View>
      {onClose ? <IconButton icon={X} label="Cancel" onPress={onClose} size={18} /> : null}
    </View>
  );
}
