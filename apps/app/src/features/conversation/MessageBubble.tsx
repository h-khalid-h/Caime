import type { FileView, MessageMailView, MessageView } from '@caime/core/api';
import { AI_LABEL } from '@caime/core/assist';
import { emojiOnly } from '@caime/core/emoji';
import {
  formatBytes,
  formatClock,
  formatDuration,
  messagePreview,
  systemText,
} from '@caime/core/format';
import { listed, tr } from '@caime/core/i18n';
import { type Mentionable, type MentionSpan, mentionSpans } from '@caime/core/mentions';
import { imageFor } from '@caime/core/renditions';
import { CAI_ID } from '@caime/core/system-ids';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import AtSign from 'lucide-react-native/icons/at-sign';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import Clock from 'lucide-react-native/icons/clock';
import Smile from 'lucide-react-native/icons/face-slightly-smiling';
import FileText from 'lucide-react-native/icons/file-text';
import Languages from 'lucide-react-native/icons/languages';
import Pin from 'lucide-react-native/icons/pin';
import UserRound from 'lucide-react-native/icons/user-round';
import { lazy, memo, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { Character } from '@/brand/Character';
import { type Translation, useTranslations } from '@/features/assist/translations';
import { FollowUpOffer, type FollowUpPayload } from '@/features/cai/FollowUpOffer';
import {
  readAs,
  suspiciousLink,
  UNVERIFIED,
  useOpened,
  useReplyPreview,
} from '@/features/e2ee/hooks';
import { KitCard } from '@/features/kits/KitCard';
import { LocationBody } from '@/features/location/LocationBody';
import { drawable, showPhotos } from '@/features/media/viewer';
import { stickerById } from '@/features/stickers/pack';
import { durationOf, transcriptOf } from '@/features/voice/transcript';
import { linkify, openLink, opensWithEnter, type TextPart } from '@/lib/links';
import { openFile } from '@/lib/openFile';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Forward, ReplyArrow } from '@/ui/directional';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { LinkCard } from './LinkCard';
import { PollBody } from './PollBody';

/** The player loads with the first voice note shown, never before (the audio module). */
const VoiceNote = lazy(() =>
  import('@/features/voice/parts').then((m) => ({ default: m.VoiceNote })),
);
/** A video's player loads with the first video shown (M16 E4b). */
const VideoTile = lazy(() => import('@/features/media/VideoTile'));

export type Delivery = 'queued' | 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/**
 * The emoji an inbox preview opens with ("📷 Photo", core's `messagePreview`), which a screen
 * reader would read out.
 */
const LEADING_EMOJI = /^(?:📷|📎|🎙|📍|👤|📊)\uFE0F? /u;

/** How big a message of emoji alone is drawn (M16 E3): one biggest, three still large. */
const BIG_EMOJI_SIZE = [0, 52, 44, 36];

interface HoverOwner {
  end: () => void;
}
/** The bubble whose hover actions show (web): one at a time. */
let hovering: HoverOwner | null = null;

/** A plain part of a message's words, cut where it names someone (M16 E3); links stay whole. */
function cutAtMentions(
  part: TextPart,
  spans: MentionSpan[],
): Array<TextPart & { mention?: string }> {
  if (part.url || spans.length === 0) return [part];
  const end = part.start + part.text.length;
  const out: Array<TextPart & { mention?: string }> = [];
  let at = part.start;
  for (const s of spans) {
    if (s.end <= at || s.start >= end) continue;
    const from = Math.max(s.start, at);
    const to = Math.min(s.end, end);
    if (from > at)
      out.push({ text: part.text.slice(at - part.start, from - part.start), start: at });
    out.push({
      text: part.text.slice(from - part.start, to - part.start),
      start: from,
      mention: s.userId,
    });
    at = to;
  }
  if (at < end) out.push({ text: part.text.slice(at - part.start), start: at });
  return out;
}

export interface BubbleProps {
  m: MessageView;
  mine: boolean;
  /** First in a run from the same sender (shows their name in groups). */
  first: boolean;
  /** Last in the run (gets the tail and the time). */
  last: boolean;
  senderName?: string | null;
  /** Who wrote the message this one answers (M16 E2); the quote says "Reply" without it. */
  replyName?: string | null;
  /** Go to the message this one answers. */
  onOpenReply?: (m: MessageView) => void;
  /** Who wrote the group's message this answers privately (M16 E3b). */
  privateReplyName?: string | null;
  delivery?: Delivery;
  timeZone: string;
  locale: string;
  onLongPress?: (m: MessageView) => void;
  onReply?: (m: MessageView) => void;
  onReact?: (m: MessageView, emoji: string) => void;
  onRetry?: (m: MessageView) => void;
  onOpenReactions?: (m: MessageView) => void;
  /** Briefly marked: the message someone jumped to from search. */
  highlighted?: boolean;
  /** In a message request not yet accepted, links read as text and open nothing (R14). */
  inertLinks?: boolean;
  /**
   * In a message request not yet accepted, photos come blurred (M16 B4): `tap` shows one on a
   * tap, `accept` (under 18) only once the request is accepted.
   */
  veil?: 'tap' | 'accept';
  /** The conversation shown, and whether it's private (R18): messages open only as its. */
  where: { conversationId: string; private: boolean };
  /** Its people, for the names a message mentions to be marked where they're written (M16 E3). */
  mentionables?: Mentionable[];
}

/**
 * Where one's own message is, as a mark: sent and delivered in the bubble's tick colour, read in
 * its strongest and heavier (M16 E1), so read never looks like delivered whatever the colours.
 */
function DeliveryIcon({
  delivery,
  color,
  readColor,
}: {
  delivery?: Delivery;
  color: string;
  readColor: string;
}) {
  // The words are on a View that is an image: a label on the icon itself lands on its path
  // on the web, where a screen reader can't place it (axe: aria-prohibited-attr).
  const mark = (label: string, icon: ReactNode) => (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      {icon}
    </View>
  );
  const word = deliveryWord(delivery);
  switch (delivery) {
    case 'queued':
    case 'sending':
      return mark(word, <Clock size={12} color={color} />);
    case 'failed':
      return mark(word, <CircleAlert size={13} color="#FFFFFF" />);
    case 'sent':
      return mark(word, <Check size={13} color={color} />);
    case 'delivered':
      return mark(word, <CheckCheck size={13} color={color} />);
    case 'read':
      return mark(word, <CheckCheck size={13} color={readColor} strokeWidth={2.75} />);
    default:
      return null;
  }
}

/** Where a message of one's own is, in words: its mark's and the bubble's for a screen reader. */
function deliveryWord(delivery: Delivery | undefined): string {
  switch (delivery) {
    case 'queued':
    case 'sending':
      return tr('Sending');
    case 'failed':
      return tr('Not sent');
    case 'sent':
      return tr('Sent');
    case 'delivered':
      return tr('Delivered');
    case 'read':
      return tr('Read');
    default:
      return '';
  }
}

/** A translation the reader asked for, under the original and labelled as Caime's (R17). */
function TranslationBlock({
  id,
  value,
  fg,
  meta,
}: {
  id: string;
  value: Translation;
  fg: string;
  meta: string;
}) {
  const t = useTheme();
  const hide = () => useTranslations.getState().hide(id);
  return (
    <View
      testID="message-translation"
      accessibilityLiveRegion="polite"
      style={{
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: t.c.border,
        gap: 2,
      }}
    >
      {value.state === 'loading' ? (
        <Text variant="caption" color={meta}>
          {tr('Translating…')}
        </Text>
      ) : value.state === 'failed' ? (
        <Text variant="caption" color="danger">
          {value.error}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Languages size={12} color={meta} />
            <Text variant="caption" color={meta} style={{ fontSize: 11 }}>
              {value.language} · {value.label}
            </Text>
          </View>
          <Text variant="message" color={fg} selectable={Platform.OS === 'web'} auto={value.text}>
            {value.text}
          </Text>
        </>
      )}
      {value.state !== 'loading' ? (
        <Pressable accessibilityRole="button" onPress={hide} hitSlop={6}>
          <Text variant="captionStrong" color={meta} style={{ fontSize: 11 }}>
            {tr('Hide translation')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * What a message that came or went as mail says of itself (R75): that it came by email, or how
 * far one sent got as the mail servers said (sent, delivered, bounced); never a read.
 */
/**
 * A file in a message: its name and size, opened with the session (R88: on a phone, fetched and
 * handed to the system's sheet; in a browser, a tab of its own).
 */
function FileRow({
  f,
  fg,
  meta,
  mine,
  onHold,
}: {
  f: FileView;
  fg: string;
  meta: string;
  mine: boolean;
  onHold?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${f.name}, ${formatBytes(f.size)}`}
      onPress={() => void openFile(f).catch((e: Error) => toast(e.message, { tone: 'danger' }))}
      onLongPress={onHold}
      delayLongPress={300}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 }}
      testID="message-file"
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: mine ? 'rgba(255,255,255,0.18)' : t.c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FileText size={20} color={fg} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text variant="bodyStrong" color={fg} numberOfLines={1}>
          {f.name}
        </Text>
        <Text variant="caption" color={meta}>
          {formatBytes(f.size)}
        </Text>
      </View>
    </Pressable>
  );
}

/** A mail's signature, folded until asked for (R75). */
function MailSignature({ text, meta, onHold }: { text: string; meta: string; onHold: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        onLongPress={onHold}
        delayLongPress={300}
        hitSlop={8}
        style={{ alignSelf: 'flex-start' }}
        testID="message-mail-signature"
      >
        <Text variant="captionStrong" color={meta}>
          {open ? tr('Hide signature') : tr('Signature')}
        </Text>
      </Pressable>
      {open ? (
        <Text variant="caption" color={meta} selectable={Platform.OS === 'web'} auto={text}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

function mailLine(mail: MessageMailView, spoken: boolean): string {
  // Its sender couldn't be confirmed (M16 F1): never taken as whoever its address names.
  if (mail.direction === 'in' && mail.unverified)
    return spoken ? tr('by email, sender not confirmed') : tr('by email, sender not confirmed ·');
  if (mail.direction === 'in') return spoken ? tr('by email') : tr('by email ·');
  // Seen is certain (they replied, or opened it in Caime); opened is the provider's pixel.
  if (mail.seenAt) return spoken ? tr('seen, by email') : tr('Seen by email ·');
  if (mail.openedAt && mail.delivery !== 'bounced')
    return spoken ? tr('opened by email, probably') : tr('Opened, probably ·');
  switch (mail.delivery) {
    case 'delivered':
      return spoken ? tr('delivered by email') : tr('Delivered by email ·');
    case 'bounced':
      return spoken ? tr('bounced, not delivered') : tr('Bounced, not delivered ·');
    case 'sent':
      return spoken ? tr('sent by email') : tr('Sent by email ·');
    default:
      return spoken ? tr('sending by email') : tr('Sending by email ·');
  }
}

export const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  first,
  last,
  senderName,
  replyName,
  onOpenReply,
  privateReplyName,
  delivery,
  timeZone,
  locale,
  onLongPress,
  onReply,
  onReact,
  onRetry,
  onOpenReactions,
  highlighted,
  inertLinks = false,
  veil,
  where,
  mentionables,
}: BubbleProps) {
  const t = useTheme();
  // Seen on a tap, for this message, while it's shown (M16 B4).
  const [unveiled, setUnveiled] = useState(false);
  const veiled = veil !== undefined && !unveiled;
  const meId = useSession((s) => s.user?.id ?? null);
  const translation = useTranslations((s) => s.byId[m.id]);
  // A private message's words are opened here, on this device (R18); in a private conversation,
  // anything not sealed isn't shown.
  const opened = useOpened(m, where);
  const text = m.sealed || where.private ? opened.text : m.body;
  const replyText = useReplyPreview(m.replyTo, where, opened.replyTo);
  // The names it mentions, marked where they're written: only the people the message itself
  // says it mentions, read from the words as shown (a private message's as opened here).
  const spans = useMemo(
    () =>
      text && m.mentions.length && mentionables
        ? mentionSpans(text, mentionables).filter((s) => m.mentions.includes(s.userId))
        : [],
    [text, m.mentions, mentionables],
  );
  // Hover actions (web) sit beside the bubble, not inside it: a pressable inside another ends
  // the outer one's hover, which took the buttons away just as the pointer reached them. Moving
  // from the bubble to the buttons gets a moment's grace; moving onto another bubble ends it at
  // once, so one bubble's actions show at a time.
  const [hover, setHover] = useState(false);
  const hideHover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const self = useRef<HoverOwner | null>(null);
  self.current ??= {
    end: () => {
      if (hideHover.current) clearTimeout(hideHover.current);
      hideHover.current = null;
      setHover(false);
    },
  };
  const hoverIn = () => {
    if (hideHover.current) clearTimeout(hideHover.current);
    hideHover.current = null;
    if (hovering && hovering !== self.current) hovering.end();
    hovering = self.current;
    setHover(true);
  };
  const hoverOut = () => {
    if (hideHover.current) clearTimeout(hideHover.current);
    hideHover.current = setTimeout(() => {
      setHover(false);
      if (hovering === self.current) hovering = null;
    }, 150);
  };
  useEffect(
    () => () => {
      if (hideHover.current) clearTimeout(hideHover.current);
      if (hovering === self.current) hovering = null;
    },
    [],
  );
  const r = t.radii.bubble;
  const tail = t.radii.bubbleTail;
  const deleted = m.deletedAt !== null;
  // Someone "@"-named the viewer in it (PRD §20).
  const forMe = !mine && !deleted && meId !== null && m.mentions.includes(meId);
  // Kit cards sit on a neutral card on both sides, so their buttons read the same everywhere.
  const card = m.kind === 'kit' && !deleted && delivery !== 'failed';
  // Emoji alone (M16 E3): drawn big and on the page, as every messenger does; never one that
  // answers, was forwarded, came by mail, failed or has a translation under it.
  const big =
    !deleted &&
    m.kind === 'text' &&
    text &&
    !m.replyTo &&
    !m.forwarded &&
    !m.mail &&
    !translation &&
    delivery !== 'failed'
      ? emojiOnly(text)
      : 0;
  const bg =
    delivery === 'failed' ? t.c.danger : card ? t.c.surface : mine ? t.bubble.bg : t.c.bubbleOther;
  const fg =
    delivery === 'failed' ? '#FFFFFF' : card ? t.c.text : mine ? t.bubble.fg : t.c.onBubbleOther;
  const meta =
    delivery === 'failed' ? '#FFFFFF' : card || big || !mine ? t.c.textTertiary : t.bubble.meta;
  const sticker =
    m.kind === 'sticker' && !deleted
      ? stickerById((m.payload as { sticker?: string }).sticker)
      : undefined;
  const time = formatClock(m.createdAt, timeZone, locale);

  if (m.kind === 'system') {
    // A topic started from here opens from its line (PRD §58).
    const said = m.payload as { event?: string; conversationId?: unknown };
    const topic =
      said.event === 'topic_started' && typeof said.conversationId === 'string'
        ? said.conversationId
        : null;
    const line = (
      <View
        style={{
          backgroundColor: t.c.surfaceMuted,
          borderRadius: t.radii.sm,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text variant="caption" color={topic ? 'link' : 'textSecondary'} align="center">
          {m.body ?? systemText(m.payload, meId)}
        </Text>
      </View>
    );
    return (
      <View style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 24 }}>
        {topic ? (
          <Pressable
            accessibilityRole="link"
            accessibilityHint={tr('Opens the topic')}
            onPress={() => router.navigate({ pathname: '/c/[id]', params: { id: topic } })}
            testID="topic-line"
          >
            {line}
          </Pressable>
        ) : (
          line
        )}
      </View>
    );
  }

  const radius = {
    borderTopStartRadius: !mine && !first ? tail : r,
    borderBottomStartRadius: !mine && !last ? tail : r,
    borderTopEndRadius: mine && !first ? tail : r,
    borderBottomEndRadius: mine && !last ? tail : r,
  };

  // A long press on anything inside the bubble (a photo, a file, a link) is the message's, as on
  // the bubble itself (R88): a phone has no hover, and the inner press would take the touch.
  const hold = () => onLongPress?.(m);

  // The group's message this answers privately (M16 E3b): who wrote it and where, read again
  // for the reader, and a tap away while they may still read it there.
  const answered = m.privateReply;
  const privateQuote = answered ? (
    <Pressable
      accessibilityRole={answered.seq !== null ? 'link' : 'text'}
      accessibilityLabel={listed([
        tr('Replied privately'),
        privateReplyName,
        answered.title,
        answered.preview ?? tr('That message can’t be shown here any more.'),
      ])}
      onPress={
        answered.seq !== null
          ? () =>
              router.push({
                pathname: '/c/[id]',
                params: { id: answered.conversationId, seq: String(answered.seq) },
              })
          : undefined
      }
      onLongPress={hold}
      style={{
        borderStartWidth: 3,
        borderStartColor: mine ? t.bubble.meta : t.c.accent,
        paddingStart: 8,
        marginBottom: 6,
        opacity: 0.9,
      }}
      testID="message-private-quote"
    >
      <Text variant="captionStrong" color={mine ? fg : 'textSecondary'} numberOfLines={1}>
        {privateReplyName && answered.title
          ? tr('{name} in {group}, privately', { name: privateReplyName, group: answered.title })
          : tr('Replied privately')}
      </Text>
      <Text variant="caption" color={mine ? fg : 'textSecondary'} numberOfLines={2}>
        {answered.preview ?? tr('That message can’t be shown here any more.')}
      </Text>
    </Pressable>
  ) : null;

  // The message it answers, by whoever wrote it, and a tap away (M16 E2).
  const reply = m.replyTo ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={listed([replyName ?? tr('Reply'), replyText])}
      accessibilityHint={tr('Shows the message it answers')}
      onPress={onOpenReply ? () => onOpenReply(m) : undefined}
      onLongPress={hold}
      style={{
        borderStartWidth: 3,
        borderStartColor: mine ? t.bubble.meta : t.c.accent,
        paddingStart: 8,
        marginBottom: 6,
        opacity: 0.9,
      }}
      testID="message-quote"
    >
      <Text variant="captionStrong" color={mine ? fg : 'textSecondary'} numberOfLines={1} auto>
        {replyName ?? tr('Reply')}
      </Text>
      <Text variant="caption" color={mine ? fg : 'textSecondary'} numberOfLines={2}>
        {replyText}
      </Text>
    </Pressable>
  ) : null;
  // A private message's links are checked here, from its words: the server never had them.
  const open = (url: string) =>
    void suspiciousLink(m, url)
      .then((unusual) => openLink(url, unusual))
      .catch(() => openLink(url, true));
  const words = text ? (
    <Text variant="message" color={fg} selectable={Platform.OS === 'web'} auto={text}>
      {linkify(text)
        .flatMap((part) => cutAtMentions(part, spans))
        .map((part) =>
          part.url && !inertLinks ? (
            <Text
              key={`${part.start}`}
              variant="message"
              color={mine ? fg : t.c.link}
              style={{ textDecorationLine: 'underline' }}
              onPress={() => open(part.url ?? '')}
              onLongPress={hold}
              accessibilityRole="link"
              {...opensWithEnter(() => open(part.url ?? ''))}
            >
              {part.text}
            </Text>
          ) : part.mention ? (
            // Someone named (M16 E3): stronger, and the reader's own name marked as theirs.
            <Text
              key={`${part.start}`}
              variant="message"
              weight={600}
              color={mine ? fg : t.c.accentStrong}
              style={
                part.mention === meId && !mine
                  ? { backgroundColor: t.c.accentSoft, borderRadius: 4 }
                  : undefined
              }
              testID={part.mention === meId ? 'mention-you' : 'mention'}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
    </Text>
  ) : null;
  // A mail's signature (R75), folded under its words so a thread reads as a chat.
  const signature = m.mail?.signature && !deleted ? m.mail.signature : null;
  const bodyText =
    words && signature ? (
      <View style={{ gap: 4 }}>
        {words}
        <MailSignature text={signature} meta={meta} onHold={hold} />
      </View>
    ) : (
      words
    );

  let content: React.ReactNode;
  if (deleted) {
    content = (
      <Text variant="message" color={meta} style={{ fontStyle: 'italic' }}>
        {tr('Message deleted')}
      </Text>
    );
  } else if (readAs(m, where) === 'unverified') {
    // In a private conversation only sealed text is written: anything else (a card, a file, a
    // poll, words in the clear) didn't come from anyone's device, so it isn't shown.
    content = (
      <Text
        variant="message"
        color={meta}
        style={{ fontStyle: 'italic' }}
        testID="message-sealed-note"
      >
        {tr(UNVERIFIED)}
      </Text>
    );
  } else if (m.kind === 'media' && m.files.length) {
    // Photos open full screen in Caime (R88); anything no screen can draw (a HEIC from a
    // browser that couldn't turn it into a JPEG) is a file to open, never a broken picture.
    const photos = m.files.filter(drawable);
    // A video plays where it is (M16 E4b); veiled from a stranger as a photo is.
    const videos = m.files.filter((f) => f.kind === 'video');
    const others = m.files.filter((f) => !drawable(f) && f.kind !== 'video');
    content = (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {photos.map((f, i) => {
            const ratio = f.width && f.height ? f.width / f.height : 4 / 3;
            const single = photos.length === 1;
            const w = single ? 240 : 118;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={
                  veiled
                    ? veil === 'tap'
                      ? tr('A photo from someone you’re not connected with. Tap to see it.')
                      : tr('A photo from someone you’re not connected with. Accept to see it.')
                    : f.name
                }
                onPress={() =>
                  veiled ? veil === 'tap' && setUnveiled(true) : showPhotos(photos, i)
                }
                onLongPress={hold}
                delayLongPress={300}
                testID={veiled ? 'message-photo-veiled' : 'message-photo'}
              >
                <Image
                  source={{
                    uri:
                      mediaUrl(imageFor(f, Math.max(w, single ? Math.min(320, w / ratio) : w))) ??
                      undefined,
                    headers: mediaHeaders(),
                  }}
                  style={{
                    width: w,
                    height: single ? Math.min(320, w / ratio) : w,
                    borderRadius: t.radii.sm,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                  blurRadius={veiled ? 40 : 0}
                  contentFit="cover"
                  transition={150}
                />
                {veiled ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      right: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      variant="captionStrong"
                      style={{
                        backgroundColor: t.c.surface,
                        borderRadius: t.radii.sm,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        overflow: 'hidden',
                      }}
                    >
                      {veil === 'tap' ? tr('Tap to see') : tr('Accept to see')}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {videos.map((f) =>
          veiled ? (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={
                veil === 'tap'
                  ? tr('A video from someone you’re not connected with. Tap to see it.')
                  : tr('A video from someone you’re not connected with. Accept to see it.')
              }
              onPress={() => veil === 'tap' && setUnveiled(true)}
              onLongPress={hold}
              delayLongPress={300}
              style={{
                width: 240,
                height: 135,
                borderRadius: t.radii.sm,
                backgroundColor: t.c.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="message-video-veiled"
            >
              <Text variant="captionStrong">
                {veil === 'tap' ? tr('Tap to see') : tr('Accept to see')}
              </Text>
            </Pressable>
          ) : (
            <Suspense
              key={f.id}
              fallback={
                <View
                  style={{
                    width: 240,
                    height: 135,
                    borderRadius: t.radii.sm,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                />
              }
            >
              <VideoTile file={f} width={240} onHold={hold} />
            </Suspense>
          ),
        )}
        {others.map((f) => (
          <FileRow key={f.id} f={f} fg={fg} meta={meta} mine={mine} onHold={hold} />
        ))}
        {bodyText}
      </View>
    );
  } else if (m.kind === 'voice' && m.files.length) {
    // The note plays; its words, when Caime has heard them (PRD §46), read under it as what the
    // sender said, labelled as Caime's hearing.
    const audio = m.files[0]!;
    const heard = transcriptOf(m.payload);
    content = (
      <View style={{ gap: 6 }}>
        <Suspense
          fallback={
            <Text variant="caption" color={meta}>
              {formatDuration(durationOf(m.payload, audio.durationMs) ?? 0)}
            </Text>
          }
        >
          <VoiceNote
            url={audio.url}
            durationMs={durationOf(m.payload, audio.durationMs)}
            payload={m.payload}
            fg={fg}
            meta={meta}
            mine={mine}
          />
        </Suspense>
        {text ? (
          <View style={{ gap: 2 }} testID="voice-transcript">
            <Text variant="caption" color={meta}>
              {heard ? tr('Transcript · {label}', { label: tr(AI_LABEL) }) : tr('Transcript')}
            </Text>
            {bodyText}
          </View>
        ) : null}
      </View>
    );
  } else if (m.kind === 'file' && m.files.length) {
    content = (
      <View style={{ gap: 6 }}>
        {m.files.map((f) => (
          <FileRow key={f.id} f={f} fg={fg} meta={meta} mine={mine} onHold={hold} />
        ))}
        {bodyText}
      </View>
    );
  } else if (m.kind === 'poll' && m.poll) {
    content = <PollBody m={m} fg={fg} meta={meta} mine={mine} onHold={hold} />;
  } else if (m.kind === 'location') {
    content = <LocationBody m={m} mine={mine} fg={fg} meta={meta} onHold={hold} />;
  } else if (m.kind === 'contact') {
    const p = m.payload as { name?: string };
    content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <UserRound size={18} color={fg} />
        <Text variant="message" color={fg}>
          {p.name ?? tr('Contact')}
        </Text>
      </View>
    );
  } else if (m.kind === 'kit') {
    content = <KitCard m={m} mine={mine} />;
  } else if (m.sealed && !text) {
    // Opening it, or why this device can't show it.
    content = (
      <Text
        variant="message"
        color={meta}
        style={{ fontStyle: 'italic' }}
        testID={opened.note ? 'message-sealed-note' : undefined}
      >
        {opened.note ?? '…'}
      </Text>
    );
  } else {
    content = bodyText;
  }

  const metaRow = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-end',
        marginTop: 2,
      }}
    >
      {m.forwarded ? <Forward size={11} color={meta} /> : null}
      {m.pinnedAt && !deleted ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={tr('Pinned')}
          testID="message-pinned"
        >
          <Pin size={11} color={meta} />
        </View>
      ) : null}
      {forMe ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={tr('Mentions you')}
          testID="message-mentions-me"
        >
          <AtSign size={11} color={card ? t.c.accentStrong : meta} />
        </View>
      ) : null}
      {m.automated ? (
        // A bot's message always says so (R16), and an AI agent's that it's an AI (PRD §75),
        // for the customer and the team alike.
        <Text variant="caption" color={meta} style={{ fontSize: 11 }} testID="message-automated">
          {m.aiAgent ? tr('AI agent ·') : tr('Automated ·')}
        </Text>
      ) : null}
      {m.aiAgent && (m.payload as { cited?: unknown[] }).cited?.length && !deleted ? (
        // What its answer rests on (M16 G6a): its team's alone (the customer is never sent it),
        // read in the message's sheet.
        <Pressable
          accessibilityRole="button"
          onPress={hold}
          onLongPress={hold}
          delayLongPress={300}
          hitSlop={8}
          testID="message-cited"
        >
          <Text variant="captionStrong" color={meta} style={{ fontSize: 11 }}>
            {tr('Sources')}
          </Text>
        </Pressable>
      ) : null}
      {(m.payload as { imported?: unknown }).imported ? (
        // Brought over from another app (R45): written there, by whoever it says, before Caime.
        <Text variant="caption" color={meta} style={{ fontSize: 11 }} testID="message-imported">
          {tr('Imported ·')}
        </Text>
      ) : null}
      {m.mail ? (
        // Came or went as mail (R75): where it came from, or how far it got as the mail servers
        // said; never a read.
        <Text
          variant="caption"
          color={meta}
          style={{ fontSize: 11 }}
          numberOfLines={1}
          testID="message-mail"
        >
          {mailLine(m.mail, false)}
        </Text>
      ) : null}
      {m.mail?.hasHtml && !deleted ? (
        // The mail as its sender laid it out (R75 phase 2), in a sandbox the server sets.
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            void openFile({
              id: `mail-${m.id}`,
              url: `/v1/messages/${m.id}/mail.html`,
              name: `${m.mail?.subject || tr('Mail')}.html`,
              mime: 'text/html',
            }).catch((e: Error) => toast(e.message, { tone: 'danger' }))
          }
          onLongPress={hold}
          delayLongPress={300}
          hitSlop={8}
          testID="message-mail-html"
        >
          <Text variant="captionStrong" color={meta} style={{ fontSize: 11 }}>
            {tr('View as sent')}
          </Text>
        </Pressable>
      ) : null}
      {m.sentVia ? (
        // Sent through a token or an app its sender let in, not typed here (PRD §74).
        <Text
          variant="caption"
          color={meta}
          style={{ fontSize: 11 }}
          numberOfLines={1}
          testID="message-sent-via"
        >
          {tr('via {sentVia} ·', { sentVia: m.sentVia })}
        </Text>
      ) : null}
      {m.editedAt && !deleted ? (
        <Text variant="caption" color={meta} style={{ fontSize: 11 }}>
          {tr('edited')}
        </Text>
      ) : null}
      <Text variant="caption" color={meta} style={{ fontSize: 11 }}>
        {delivery === 'failed' ? tr('Not sent · tap to retry') : time}
      </Text>
      {mine ? (
        <DeliveryIcon
          delivery={delivery}
          color={delivery === 'failed' ? meta : card || big ? t.c.textTertiary : t.bubble.tick}
          readColor={card || big ? t.c.text : t.bubble.fg}
        />
      ) : null}
    </View>
  );

  // Cai's offer of a follow-up (R68), sent or changed only by the reader's tap.
  const followUp = (m.payload as { followUp?: FollowUpPayload } | null)?.followUp;

  // What a screen reader says of the bubble, every word in the reader's language: a photo, a
  // card or a voice note without words reads as its preview does in the inbox, less the emoji.
  const accessibleText = listed([
    mine ? tr('You') : (senderName ?? ''),
    forMe ? tr('Mentions you') : '',
    m.pinnedAt && !deleted ? tr('Pinned') : '',
    m.forwarded && !deleted ? tr('Forwarded') : '',
    m.automated ? (m.aiAgent ? tr('AI agent') : tr('Automated')) : '',
    m.sentVia ? tr('sent via {sentVia}', { sentVia: m.sentVia }) : '',
    m.mail ? mailLine(m.mail, true) : '',
    deleted
      ? tr('Message deleted')
      : text ||
        opened.note ||
        (sticker ? tr(sticker.label) : '') ||
        messagePreview({ kind: m.kind, body: null, payload: m.payload, deleted: false }).replace(
          LEADING_EMOJI,
          '',
        ),
    time,
    mine ? deliveryWord(delivery) : '',
  ]);

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: first ? 6 : 1,
        paddingBottom: last ? 4 : 1,
        alignItems: mine ? 'flex-end' : 'flex-start',
        backgroundColor: highlighted ? t.c.accentSoft : 'transparent',
      }}
      testID={highlighted ? 'message-highlighted' : undefined}
    >
      {first && senderName && !mine ? (
        <Text
          variant="captionStrong"
          color="textSecondary"
          style={{ marginStart: 12, marginBottom: 3 }}
        >
          {senderName}
        </Text>
      ) : null}
      <View
        style={{
          maxWidth: '82%',
          flexDirection: mine ? 'row-reverse' : 'row',
          alignItems: 'center',
          // The hover actions sit beside, over the margin, never in the row (see below).
          position: 'relative',
        }}
      >
        <Pressable
          accessibilityRole="text"
          accessibilityLabel={accessibleText}
          accessibilityHint={
            Platform.OS === 'web'
              ? tr('Press Enter for actions')
              : tr('Double tap and hold for actions')
          }
          onLongPress={() => onLongPress?.(m)}
          onPress={delivery === 'failed' ? () => onRetry?.(m) : undefined}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          // The keyboard reaches what the mouse does (R20): focus shows the actions beside the
          // bubble, and Enter, Shift+F10 or the menu key opens them all.
          onFocus={hoverIn}
          onBlur={hoverOut}
          onKeyDown={(e) => {
            const key = e.key ?? e.nativeEvent?.key;
            const shift = e.shiftKey ?? e.nativeEvent?.shiftKey;
            if (key === 'Enter' || key === 'ContextMenu' || (key === 'F10' && shift)) {
              e.preventDefault?.();
              onLongPress?.(m);
            }
          }}
          delayLongPress={300}
          focusRadius={r}
          style={{ flexShrink: 1 }}
        >
          {sticker ? (
            <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <Character
                name={sticker.character}
                expression={sticker.expression}
                size={132}
                label={tr(sticker.label)}
              />
              <Text
                variant="caption"
                color="textTertiary"
                style={{ fontSize: 11 }}
                testID={m.automated ? 'message-automated' : undefined}
              >
                {/* A bot's sticker says it's a bot's too (R16). */}
                {m.automated ? `${m.aiAgent ? tr('AI agent') : tr('Automated')} · ${time}` : time}
              </Text>
            </View>
          ) : big ? (
            <View
              style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
              testID="message-big-emoji"
            >
              <Text
                style={{
                  fontSize: BIG_EMOJI_SIZE[big],
                  lineHeight: (BIG_EMOJI_SIZE[big] ?? 36) * 1.2,
                }}
                maxFontSizeMultiplier={1.2}
              >
                {text}
              </Text>
              {metaRow}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: bg,
                paddingHorizontal: 12,
                paddingTop: card ? 10 : 8,
                paddingBottom: 6,
                flexShrink: 1,
                ...(card ? { borderWidth: 1, borderColor: t.c.border } : {}),
                ...radius,
              }}
            >
              {reply}
              {privateQuote}
              {content}
              {/* Its first link's page (M16 E4c), never veiled words' or a stranger's unseen. */}
              {m.link && !deleted && !veiled ? (
                <LinkCard
                  link={m.link}
                  mine={mine}
                  fg={fg}
                  onPress={() => open(m.link?.url ?? '')}
                  onLongPress={hold}
                  testID="link-preview"
                />
              ) : null}
              {translation && !deleted ? (
                <TranslationBlock id={m.id} value={translation} fg={fg} meta={meta} />
              ) : null}
              {metaRow}
            </View>
          )}
        </Pressable>
        {hover && !deleted && onReply ? (
          <View
            style={{
              position: 'absolute',
              top: '50%',
              transform: [{ translateY: -14 }],
              ...(mine ? { end: '100%', marginEnd: 6 } : { start: '100%', marginStart: 6 }),
              flexDirection: mine ? 'row-reverse' : 'row',
              gap: 2,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('Reply')}
              onPress={() => onReply(m)}
              onHoverIn={hoverIn}
              onHoverOut={hoverOut}
              hitSlop={6}
              style={{ padding: 6, borderRadius: t.radii.lg, backgroundColor: t.c.surface }}
            >
              <ReplyArrow size={16} color={t.c.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('React')}
              onPress={() => onLongPress?.(m)}
              onHoverIn={hoverIn}
              onHoverOut={hoverOut}
              hitSlop={6}
              style={{ padding: 6, borderRadius: t.radii.lg, backgroundColor: t.c.surface }}
            >
              <Smile size={16} color={t.c.textSecondary} />
            </Pressable>
          </View>
        ) : null}
      </View>
      {followUp && m.senderId === CAI_ID ? (
        <FollowUpOffer messageId={m.id} offer={followUp} />
      ) : null}
      {m.reactions.length ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            marginTop: -4,
            marginHorizontal: 10,
            flexWrap: 'wrap',
            justifyContent: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {m.reactions.map((re) => (
            <Pressable
              key={re.emoji}
              accessibilityRole="button"
              accessibilityLabel={
                re.mine
                  ? tr('{emoji} {count}, including you', { emoji: re.emoji, count: re.count })
                  : `${re.emoji} ${re.count}`
              }
              accessibilityState={{ selected: re.mine }}
              accessibilityHint={tr('Hold to see who reacted')}
              onPress={() => onReact?.(m, re.emoji)}
              onLongPress={() => (onOpenReactions ?? onLongPress)?.(m)}
              // Drawn small beside the bubble; touched as a finger needs (44 points).
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 7,
                height: 24,
                borderRadius: t.radii.sm,
                backgroundColor: re.mine ? t.c.accentSoft : t.c.surface,
                borderWidth: 1,
                borderColor: re.mine ? t.c.accent : t.c.border,
              }}
            >
              <Text variant="caption" maxFontSizeMultiplier={1.2}>
                {re.emoji}
              </Text>
              {re.count > 1 ? (
                <Text variant="caption" color="textSecondary" maxFontSizeMultiplier={1.2}>
                  {re.count}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});
