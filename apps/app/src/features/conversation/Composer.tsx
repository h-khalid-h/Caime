import type { ConversationView, CustomKitOfferView, MessageView } from '@caime/core/api';
import { listTitle } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { mentionAt, mentionCandidates, mentionedIn, mentionText } from '@caime/core/mentions';
import { isSystemKind } from '@caime/core/system-ids';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Platform, TextInput, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { type LocalFile, uploadFile } from '@/api/upload';
import { RewriteSheet } from '@/features/assist/RewriteSheet';
import { useAiReady } from '@/features/assist/ready';
import { loadPrivate, useOpened, useThisDevice, whyNotWritten } from '@/features/e2ee/hooks';
import { StartOverSheet } from '@/features/e2ee/parts';
import { privateSupported } from '@/features/e2ee/support';
import { iconNamed, KIT_ICONS } from '@/features/kits/icons';
import { type KitChoice, KitForm, type KitStart, kitsOffered } from '@/features/kits/KitForm';
import { STICKER_PACK } from '@/features/stickers/pack';
import { StickerPicker } from '@/features/stickers/StickerPicker';
import type { Recorded } from '@/features/voice/Recorder';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { realtime } from '@/realtime/client';
import { applyEditToInbox, upsertMessage } from '@/state/cache';
import { useDrafts } from '@/state/drafts';
import { useOutbox } from '@/state/outbox';
import { useMe } from '@/state/session';
import { fontFamily } from '@/theme/fonts';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import {
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  SendHorizontal,
  Sticker,
  WandSparkles,
  X,
} from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { useCardAction } from './cardActions';

/** The recorder loads when the microphone is pressed, never before (the audio module). */
const Recorder = lazy(() =>
  import('@/features/voice/parts').then((m) => ({ default: m.Recorder })),
);

export interface ComposerHandle {
  focus: () => void;
  /** Put words in the box, as if typed (a first line offered, PRD §87), and focus it. */
  insert: (text: string) => void;
}

export interface ComposerProps {
  conversation: ConversationView;
  replyTo: MessageView | null;
  onClearReply: () => void;
  editing: MessageView | null;
  onDoneEditing: () => void;
  disabled?: string | null;
  /** Something to do about why it's disabled (unblock, accept). */
  disabledAction?: { label: string; onPress: () => void; testID?: string };
  replyName?: string | null;
  /** ↑ in an empty box: edit the last message you sent (web). */
  onEditLast?: () => void;
  /** What the empty box says: "Reply as DATA C" for an organization's team (R15). */
  placeholder?: string;
  /** The conversation shown, and whether it's private here (R18, seen so on this device too). */
  where: { conversationId: string; private: boolean };
  /** Opened on this card's form (a Book link, R58). */
  openKit?: KitChoice | null;
  /** What that form starts with (R61): the item chosen. */
  kitStart?: KitStart | null;
}

const MIN_H = 44;
const MAX_H = 150;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    conversation,
    replyTo,
    onClearReply,
    editing,
    onDoneEditing,
    disabled,
    disabledAction,
    replyName,
    onEditLast,
    placeholder,
    where,
    openKit,
    kitStart,
  },
  ref,
) {
  const t = useTheme();
  const qc = useQueryClient();
  const id = conversation.id;
  // End to end encrypted (R18): text only, sealed on this device; its words are opened here, and
  // what's being written stays on this device (never mirrored to the account, nor kept).
  const privately = where.private;
  const caimes = isSystemKind(conversation.other?.person.kind);
  const stored = useDrafts((s) => (privately ? s.local[id] : s.drafts[id]));
  const [text, setText] = useState(
    () => stored ?? (privately ? '' : (conversation.me.draft ?? '')),
  );
  const [height, setHeight] = useState(MIN_H);
  const [stickers, setStickers] = useState(false);
  const [attach, setAttach] = useState(false);
  const [kit, setKit] = useState<KitChoice | null>(openKit ?? null);
  // What the form opened with starts with (R61, R62); a form opened from "+" starts empty.
  const [start, setStart] = useState<KitStart | null>(openKit ? (kitStart ?? null) : null);
  // A card asking for another card's form here (R62: Pay on an order).
  const asked = useCardAction((s) => s.request);
  useEffect(() => {
    if (!asked || asked.conversationId !== id) return;
    useCardAction.setState({ request: null });
    setCustom(null);
    setStart(asked.start);
    setKit(asked.kit);
  }, [asked, id]);
  const [custom, setCustom] = useState<CustomKitOfferView | null>(null);
  const [rewrite, setRewrite] = useState(false);
  const [recording, setRecording] = useState(false);
  const aiReady = useAiReady(conversation);
  const me = useMe();
  const kits = kitsOffered(conversation, me.minor);
  // With a customer, the team also has the organization's own kinds of card, made by its apps.
  const own = useQuery({
    queryKey: qk.conversationKits(id),
    queryFn: () => endpoints.customKits(id),
    enabled: attach && Boolean(conversation.business?.thread),
    staleTime: 60_000,
  }).data?.kits;
  const [uploading, setUploading] = useState<string | null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const editingText = useOpened(editing, where).text;
  const replyingText = useOpened(replyTo, where).text;
  // Seen as private here, and now said not to be: nothing is written from here in the clear.
  const downgraded = privately && conversation.privacyClass !== 'private';
  // This browser, until one of theirs approves it, can't write here.
  const thisDevice = useThisDevice(privately && privateSupported && !downgraded);
  const [startingOver, setStartingOver] = useState(false);
  const blocked = whyNotWritten(where, conversation.privacyClass === 'private', thisDevice);
  const input = useRef<TextInput>(null);
  const enterPref = usePrefs((p) => p.enterToSend);
  const enterSends = enterPref ?? Platform.OS === 'web';

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    insert: (v: string) => {
      onChange(v);
      input.current?.focus();
    },
  }));

  // Entering edit mode loads the message's text; leaving restores the draft.
  const value = editing ? (editText ?? editingText ?? '') : text;

  // Mentions (PRD §20), where there are more than two: "@" offers who's in it. Never in a
  // private conversation, whose server can't read who a message is for, nor with an
  // organization.
  const mentionable =
    !privately && conversation.kind !== 'business' && conversation.participants.length > 2;
  const people = useMemo(
    () =>
      conversation.participants
        .filter((p) => p.userId !== me.id)
        .map((p) => ({
          userId: p.userId,
          displayName: p.person.displayName,
          handle: p.person.handle,
          avatarUrl: p.person.avatarUrl,
        })),
    [conversation.participants, me.id],
  );
  const [caret, setCaret] = useState(value.length);
  // Where the caret goes once a name is put in, until the input says where it is.
  const [placeCaret, setPlaceCaret] = useState<{ start: number; end: number } | undefined>();
  // The "@" whose name was just picked (or put away with Esc): nothing more is offered for it.
  const [settled, setSettled] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const typing = mentionable && !editing ? mentionAt(value, caret) : null;
  const options = typing && typing.start !== settled ? mentionCandidates(typing.query, people) : [];
  const chosen = options[Math.min(active, options.length - 1)];
  // Focus stays in the text, so the picker is told to a screen reader as it changes: who Enter
  // would mention. A live region does it on the web and Android; iOS is told outright.
  const offered = chosen
    ? tr('{displayName}, {indexOf} of {length}. Enter mentions them, Escape closes the list.', {
        displayName: chosen.displayName,
        indexOf: options.indexOf(chosen) + 1,
        length: options.length,
      })
    : '';
  useEffect(() => {
    if (offered && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(offered);
  }, [offered]);
  const pickMention = (p: (typeof people)[number]) => {
    if (!typing) return;
    // Their name, or their handle where someone else here has that name too.
    const name = `@${mentionText(p, people)} `;
    const next = value.slice(0, typing.start) + name + value.slice(caret);
    const at = typing.start + name.length;
    onChange(next);
    setSettled(typing.start);
    setActive(0);
    setCaret(at);
    setPlaceCaret({ start: at, end: at });
    input.current?.focus();
  };

  const onChange = (v: string) => {
    if (editing) {
      setEditText(v);
      return;
    }
    // Typing on at the end keeps the caret there, whenever the input says so.
    if (caret >= text.length) setCaret(v.length);
    if (settled !== null && v.charAt(settled) !== '@') setSettled(null);
    setActive(0);
    setText(v);
    if (privately) useDrafts.getState().setLocal(id, v);
    else useDrafts.getState().set(id, v);
    if (v.trim()) realtime.typing(id);
  };

  const send = useCallback(async () => {
    if (disabled || blocked) return;
    if (editing) {
      const body = (editText ?? editingText ?? '').trim();
      if (!body || body === editingText) {
        setEditText(null);
        onDoneEditing();
        return;
      }
      try {
        const message = editing.sealed
          ? await (await loadPrivate()).editPrivate(editing, body)
          : (
              await endpoints.editMessage(
                editing.id,
                body,
                mentionable ? mentionedIn(body, people) : undefined,
              )
            ).message;
        upsertMessage(qc, message);
        applyEditToInbox(qc, message);
      } catch (e) {
        toast((e as Error).message, { tone: 'danger' });
      }
      setEditText(null);
      onDoneEditing();
      return;
    }
    const body = text.trim();
    if (!body) return;
    const mentions = mentionable ? mentionedIn(body, people) : [];
    useOutbox.getState().enqueue(
      id,
      {
        kind: 'text',
        body,
        replyToId: replyTo?.id ?? null,
        ...(mentions.length ? { mentions } : {}),
      },
      replyTo
        ? {
            id: replyTo.id,
            seq: replyTo.seq,
            senderId: replyTo.senderId,
            preview: replyingText ?? replyTo.body ?? '',
            kind: replyTo.kind,
          }
        : null,
      privately
        ? {
            private: true,
            // Sealed inside it: which message it answers, so it can't be moved to another.
            replyToSealed: replyTo?.sealed
              ? { by: replyTo.sealed.by, cid: replyTo.sealed.cid }
              : undefined,
          }
        : {},
    );
    setText('');
    setHeight(MIN_H);
    setCaret(0);
    setSettled(null);
    useDrafts.getState().clear(id);
    onClearReply();
    input.current?.focus();
  }, [
    disabled,
    blocked,
    editing,
    editText,
    editingText,
    text,
    id,
    replyTo,
    replyingText,
    privately,
    mentionable,
    people,
    onClearReply,
    onDoneEditing,
    qc,
  ]);

  /** A voice note (PRD §46): uploaded with its length, sent as its own kind, no caption. */
  const sendVoice = async (file: Recorded) => {
    setRecording(false);
    setUploading(tr('Voice note'));
    try {
      const uploaded = await uploadFile(file, { durationMs: file.durationMs });
      useOutbox.getState().enqueue(id, {
        kind: 'voice',
        body: null,
        fileIds: [uploaded.id],
        payload: { durationMs: file.durationMs },
        replyToId: replyTo?.id ?? null,
      });
      onClearReply();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setUploading(null);
    }
  };

  const sendFiles = async (files: LocalFile[], kind: 'media' | 'file') => {
    setUploading(files.length === 1 ? files[0]!.name : `${files.length} files`);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadFile(f));
      const caption = text.trim();
      const mentions = mentionable && caption ? mentionedIn(caption, people) : [];
      useOutbox.getState().enqueue(id, {
        kind,
        body: caption || null,
        fileIds: uploaded.map((u) => u.id),
        replyToId: replyTo?.id ?? null,
        ...(mentions.length ? { mentions } : {}),
      });
      if (text.trim()) {
        setText('');
        useDrafts.getState().clear(id);
      }
      onClearReply();
    } catch (e) {
      toast(tr('Couldn’t upload: {e}', { e: (e as Error).message }), { tone: 'danger' });
    } finally {
      setUploading(null);
    }
  };

  const pickPhotos = async () => {
    setAttach(false);
    const res = await pickFromLibrary({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.9,
    });
    if (res.canceled) return;
    // Shrunk on the device first (lib/photoSize.ts): a phone's photo is far bigger than shown.
    await sendFiles(
      await Promise.all(res.assets.map((a, i) => photoToUpload(a, `photo-${i + 1}.jpg`))),
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

  if (disabled || blocked) {
    const action =
      disabledAction ??
      (!disabled && thisDevice === 'waiting'
        ? {
            label: tr('Start over here instead'),
            onPress: () => setStartingOver(true),
            testID: 'private-start-over',
          }
        : undefined);
    return (
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: t.c.border,
          backgroundColor: t.c.surface,
        }}
      >
        <Text
          variant="body"
          color="textSecondary"
          align="center"
          testID={disabled ? undefined : 'private-blocked'}
        >
          {disabled ?? blocked}
        </Text>
        {action ? (
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <Button
              label={action.label}
              size="sm"
              variant="secondary"
              style={{ alignSelf: 'center' }}
              onPress={action.onPress}
              testID={action.testID}
            />
          </View>
        ) : null}
        <StartOverSheet open={startingOver} onClose={() => setStartingOver(false)} />
      </View>
    );
  }

  const canSend = value.trim().length > 0;
  const banner = editing ? (
    <Banner
      icon={Pencil}
      title={tr('Editing message')}
      body={editingText ?? ''}
      onClose={() => {
        setEditText(null);
        onDoneEditing();
      }}
    />
  ) : replyTo ? (
    <Banner
      icon={Reply}
      title={tr('Replying to {replyName}', { replyName: replyName ?? 'message' })}
      body={replyingText ?? replyTo.kind}
      onClose={onClearReply}
    />
  ) : uploading ? (
    <Banner icon={Paperclip} title={tr('Uploading')} body={uploading} />
  ) : null;

  return (
    <View style={{ backgroundColor: t.c.surface, borderTopWidth: 1, borderTopColor: t.c.border }}>
      {banner}
      {offered && Platform.OS !== 'ios' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: -10_000, width: 1, height: 1, overflow: 'hidden' }}
        >
          {offered}
        </Text>
      ) : null}
      {options.length ? (
        <View
          accessibilityRole="menu"
          accessibilityLabel={tr('People to mention')}
          testID="mention-picker"
          style={{ paddingHorizontal: 8, paddingTop: 6, gap: 2 }}
        >
          {options.map((p) => {
            const on = p.userId === chosen?.userId;
            return (
              <Pressable
                key={p.userId}
                accessibilityRole="menuitem"
                accessibilityLabel={tr('Mention {displayName}', { displayName: p.displayName })}
                accessibilityState={{ selected: on }}
                onPress={() => pickMention(p)}
                testID="mention-option"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: on ? t.c.accentSoft : 'transparent',
                }}
              >
                <Avatar id={p.userId} name={p.displayName} url={p.avatarUrl} size={28} />
                <Text variant="body" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                  {p.displayName}
                </Text>
                {p.handle ? (
                  <Text variant="caption" color="textTertiary" numberOfLines={1}>
                    {`@${p.handle}`}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {recording ? (
        <Suspense
          fallback={
            <View style={{ padding: 12 }}>
              <Text variant="caption" color="textSecondary">
                {tr('Starting…')}
              </Text>
            </View>
          }
        >
          <Recorder onDone={(f) => void sendVoice(f)} onCancel={() => setRecording(false)} />
        </Suspense>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 6,
          }}
        >
          {privately || caimes ? null : (
            // Photos, files and cards aren't sealed yet: a private conversation is text for now.
            // Cai and the Caime Friends read words and stickers (R67).
            <IconButton
              icon={Plus}
              label={tr('Share a photo, a file or a card')}
              filled
              onPress={() => setAttach(true)}
              disabled={Boolean(editing)}
            />
          )}
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
              accessibilityLabel={
                editing
                  ? tr('Edit message')
                  : tr('Message {listTitle}', {
                      listTitle: listTitle({
                        title: conversation.title,
                        topic: conversation.topic,
                        other: conversation.other && {
                          displayName: conversation.other.person.displayName,
                        },
                      }),
                    })
              }
              placeholder={editing ? tr('Edit message') : (placeholder ?? tr('Message'))}
              placeholderTextColor={t.c.textTertiary}
              value={value}
              onChangeText={onChange}
              selection={placeCaret}
              onSelectionChange={(e) => {
                setCaret(e.nativeEvent.selection.end);
                if (placeCaret) setPlaceCaret(undefined);
              }}
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
                // Choosing someone to mention: ↑ ↓ move, Enter or Tab picks, Esc puts it away.
                if (options.length && typing && !ne.isComposing) {
                  const at = options.findIndex((p) => p.userId === chosen?.userId);
                  if (ne.key === 'ArrowDown' || ne.key === 'ArrowUp') {
                    e.preventDefault();
                    const step = ne.key === 'ArrowDown' ? 1 : -1;
                    setActive((at + step + options.length) % options.length);
                    return;
                  }
                  if ((ne.key === 'Enter' || ne.key === 'Tab') && plain && chosen) {
                    e.preventDefault();
                    pickMention(chosen);
                    return;
                  }
                  if (ne.key === 'Escape') {
                    e.preventDefault();
                    setSettled(typing.start);
                    return;
                  }
                }
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
          {canSend && aiReady ? (
            <IconButton
              icon={WandSparkles}
              label={tr('Rewrite with Cai')}
              onPress={() => setRewrite(true)}
              testID="composer-rewrite"
            />
          ) : null}
          {canSend ? (
            <IconButton
              icon={SendHorizontal}
              label={editing ? tr('Save') : tr('Send')}
              tone="primary"
              onPress={() => void send()}
              testID="composer-send"
            />
          ) : privately ? null : (
            <>
              {caimes ? null : (
                <IconButton
                  icon={Mic}
                  label={tr('Record a voice note')}
                  filled
                  onPress={() => setRecording(true)}
                  disabled={Boolean(editing)}
                  testID="composer-voice"
                />
              )}
              <IconButton
                icon={Sticker}
                label={tr('Stickers')}
                filled
                onPress={() => setStickers(true)}
                disabled={Boolean(editing)}
              />
            </>
          )}
        </View>
      )}
      <StickerPicker
        open={stickers}
        onClose={() => setStickers(false)}
        onPick={(s) =>
          useOutbox
            .getState()
            .enqueue(id, { kind: 'sticker', payload: { pack: STICKER_PACK, sticker: s.id } })
        }
      />
      <Sheet open={attach} onClose={() => setAttach(false)} title={tr('Share')}>
        <View style={{ marginHorizontal: -20 }}>
          <ListRow
            icon={ImageIcon}
            title={tr('Photos')}
            subtitle={tr('Location data is removed before anyone sees them')}
            onPress={() => void pickPhotos()}
          />
          <ListRow
            icon={FileText}
            title={tr('A file')}
            subtitle={tr('Documents, PDFs, anything up to 100 MB')}
            onPress={() => void pickFiles()}
          />
          {kits.length || own?.length ? (
            <>
              <Text
                variant="overline"
                color="textTertiary"
                style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}
              >
                {tr('Cards')}
              </Text>
              {kits.map((k) => (
                <ListRow
                  key={k.id}
                  icon={KIT_ICONS[k.id as KitChoice]}
                  // Caime's own kits are named by keys; an organization's own as it wrote them.
                  title={tr(k.name)}
                  subtitle={tr(k.description)}
                  testID={`kit-option-${k.id}`}
                  onPress={() => {
                    setAttach(false);
                    setKit(k.id as KitChoice);
                  }}
                />
              ))}
              {own?.map((k) => (
                <ListRow
                  key={`${k.app.id}:${k.key}`}
                  icon={iconNamed(k.icon)}
                  title={k.name}
                  subtitle={k.description || tr('From {name}', { name: k.app.name })}
                  testID={`kit-option-custom-${k.key}`}
                  onPress={() => {
                    setAttach(false);
                    setCustom(k);
                  }}
                />
              ))}
            </>
          ) : null}
        </View>
      </Sheet>
      <KitForm
        conversation={conversation}
        kit={kit}
        custom={custom}
        start={start}
        onClose={() => {
          setKit(null);
          setCustom(null);
          setStart(null);
        }}
      />
      {aiReady ? (
        <RewriteSheet
          open={rewrite}
          text={value}
          conversationId={id}
          onUse={onChange}
          onClose={() => {
            setRewrite(false);
            input.current?.focus();
          }}
        />
      ) : null}
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
        paddingStart: 16,
        paddingEnd: 6,
        paddingTop: 8,
      }}
    >
      <Icon size={16} color={t.c.accentStrong} />
      <View style={{ flex: 1, borderStartWidth: 3, borderStartColor: t.c.accent, paddingStart: 8 }}>
        <Text variant="captionStrong" color="accentStrong">
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {body}
        </Text>
      </View>
      {onClose ? <IconButton icon={X} label={tr('Cancel')} onPress={onClose} size={18} /> : null}
    </View>
  );
}
