import type { MessageView } from '@caishy/core/api';
import { formatBytes, formatClock, systemText } from '@caishy/core/format';
import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { Character } from '@/brand/Character';
import { type Translation, useTranslations } from '@/features/assist/translations';
import {
  readAs,
  suspiciousLink,
  UNVERIFIED,
  useOpened,
  useReplyPreview,
} from '@/features/e2ee/hooks';
import { KitCard } from '@/features/kits/KitCard';
import { LocationBody } from '@/features/location/LocationBody';
import { stickerById } from '@/features/stickers/pack';
import { linkify, openLink, opensWithEnter } from '@/lib/links';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import {
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  CornerUpLeft,
  FileText,
  Forward,
  Languages,
  Smile,
  UserRound,
} from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { PollBody } from './PollBody';

export type Delivery = 'queued' | 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

export interface BubbleProps {
  m: MessageView;
  mine: boolean;
  /** First in a run from the same sender (shows their name in groups). */
  first: boolean;
  /** Last in the run (gets the tail and the time). */
  last: boolean;
  senderName?: string | null;
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
  /** The conversation shown, and whether it's private (R18): messages open only as its. */
  where: { conversationId: string; private: boolean };
}

function DeliveryIcon({
  delivery,
  color,
  readColor,
}: {
  delivery?: Delivery;
  color: string;
  readColor: string;
}) {
  switch (delivery) {
    case 'queued':
    case 'sending':
      return <Clock size={12} color={color} accessibilityLabel="Sending" />;
    case 'failed':
      return <CircleAlert size={13} color="#FFFFFF" accessibilityLabel="Not sent" />;
    case 'sent':
      return <Check size={13} color={color} accessibilityLabel="Sent" />;
    case 'delivered':
      return <CheckCheck size={13} color={color} accessibilityLabel="Delivered" />;
    case 'read':
      return <CheckCheck size={13} color={readColor} accessibilityLabel="Read" />;
    default:
      return null;
  }
}

/** A translation the reader asked for, under the original and labelled as Caishy's (R17). */
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
          Translating…
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
          <Text variant="message" color={fg} selectable auto={value.text}>
            {value.text}
          </Text>
        </>
      )}
      {value.state !== 'loading' ? (
        <Pressable accessibilityRole="button" onPress={hide} hitSlop={6}>
          <Text variant="captionStrong" color={meta} style={{ fontSize: 11 }}>
            Hide translation
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  first,
  last,
  senderName,
  delivery,
  timeZone,
  locale,
  onLongPress,
  onReply,
  onReact,
  onRetry,
  highlighted,
  inertLinks = false,
  where,
}: BubbleProps) {
  const t = useTheme();
  const meId = useSession((s) => s.user?.id ?? null);
  const translation = useTranslations((s) => s.byId[m.id]);
  // A private message's words are opened here, on this device (R18); in a private conversation,
  // anything not sealed isn't shown.
  const opened = useOpened(m, where);
  const text = m.sealed || where.private ? opened.text : m.body;
  const replyText = useReplyPreview(m.replyTo, where, opened.replyTo);
  // Hover actions (web) sit beside the bubble, not inside it: a pressable inside another ends
  // the outer one's hover, which took the buttons away just as the pointer reached them. Moving
  // from the bubble to the buttons gets a moment's grace.
  const [hover, setHover] = useState(false);
  const hideHover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverIn = () => {
    if (hideHover.current) clearTimeout(hideHover.current);
    hideHover.current = null;
    setHover(true);
  };
  const hoverOut = () => {
    if (hideHover.current) clearTimeout(hideHover.current);
    hideHover.current = setTimeout(() => setHover(false), 150);
  };
  useEffect(
    () => () => {
      if (hideHover.current) clearTimeout(hideHover.current);
    },
    [],
  );
  const r = t.radii.bubble;
  const tail = t.radii.bubbleTail;
  const deleted = m.deletedAt !== null;
  // Kit cards sit on a neutral card on both sides, so their buttons read the same everywhere.
  const card = m.kind === 'kit' && !deleted && delivery !== 'failed';
  const bg =
    delivery === 'failed' ? t.c.danger : card ? t.c.surface : mine ? t.bubble.bg : t.c.bubbleOther;
  const fg =
    delivery === 'failed' ? '#FFFFFF' : card ? t.c.text : mine ? t.bubble.fg : t.c.onBubbleOther;
  const meta = delivery === 'failed' ? '#FFFFFF' : card || !mine ? t.c.textTertiary : t.bubble.meta;
  const sticker =
    m.kind === 'sticker' && !deleted
      ? stickerById((m.payload as { sticker?: string }).sticker)
      : undefined;
  const time = formatClock(m.createdAt, timeZone, locale);

  if (m.kind === 'system') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 24 }}>
        <View
          style={{
            backgroundColor: t.c.surfaceMuted,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text variant="caption" color="textSecondary" align="center">
            {m.body ?? systemText(m.payload, meId)}
          </Text>
        </View>
      </View>
    );
  }

  const radius = {
    borderTopLeftRadius: !mine && !first ? tail : r,
    borderBottomLeftRadius: !mine && !last ? tail : r,
    borderTopRightRadius: mine && !first ? tail : r,
    borderBottomRightRadius: mine && !last ? tail : r,
  };

  const reply = m.replyTo ? (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: mine ? t.bubble.meta : t.c.accent,
        paddingLeft: 8,
        marginBottom: 6,
        opacity: 0.9,
      }}
    >
      <Text variant="captionStrong" color={mine ? fg : 'textSecondary'} numberOfLines={1}>
        {m.replyTo.senderId === m.senderId ? 'Replying to themselves' : 'Reply'}
      </Text>
      <Text variant="caption" color={mine ? fg : 'textSecondary'} numberOfLines={2}>
        {replyText}
      </Text>
    </View>
  ) : null;

  // A private message's links are checked here, from its words: the server never had them.
  const open = (url: string) =>
    void suspiciousLink(m, url)
      .then((unusual) => openLink(url, unusual))
      .catch(() => openLink(url, true));
  const bodyText = text ? (
    <Text variant="message" color={fg} selectable auto={text}>
      {linkify(text).map((part) =>
        part.url && !inertLinks ? (
          <Text
            key={`${part.start}`}
            variant="message"
            color={mine ? fg : t.c.link}
            style={{ textDecorationLine: 'underline' }}
            onPress={() => open(part.url ?? '')}
            accessibilityRole="link"
            {...opensWithEnter(() => open(part.url ?? ''))}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  ) : null;

  let content: React.ReactNode;
  if (deleted) {
    content = (
      <Text variant="message" color={meta} style={{ fontStyle: 'italic' }}>
        Message deleted
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
        {UNVERIFIED}
      </Text>
    );
  } else if (m.kind === 'media' && m.files.length) {
    content = (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {m.files.map((f) => {
            const ratio = f.width && f.height ? f.width / f.height : 4 / 3;
            const single = m.files.length === 1;
            const w = single ? 240 : 118;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={f.name}
                onPress={() => openLink(mediaUrl(f.url) ?? '')}
              >
                <Image
                  source={{
                    uri: mediaUrl(f.thumbUrl ?? f.url) ?? undefined,
                    headers: mediaHeaders(),
                  }}
                  style={{
                    width: w,
                    height: single ? Math.min(320, w / ratio) : w,
                    borderRadius: 12,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            );
          })}
        </View>
        {bodyText}
      </View>
    );
  } else if (m.kind === 'file' && m.files.length) {
    content = (
      <View style={{ gap: 6 }}>
        {m.files.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="link"
            accessibilityLabel={`${f.name}, ${formatBytes(f.size)}`}
            onPress={() => openLink(mediaUrl(f.url) ?? '')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 }}
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
        ))}
        {bodyText}
      </View>
    );
  } else if (m.kind === 'poll' && m.poll) {
    content = <PollBody m={m} fg={fg} meta={meta} mine={mine} />;
  } else if (m.kind === 'location') {
    content = <LocationBody m={m} mine={mine} fg={fg} meta={meta} />;
  } else if (m.kind === 'contact') {
    const p = m.payload as { name?: string };
    content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <UserRound size={18} color={fg} />
        <Text variant="message" color={fg}>
          {p.name ?? 'Contact'}
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
      {m.automated ? (
        // A bot's message always says so (R16), and an AI agent's that it's an AI (PRD §75),
        // for the customer and the team alike.
        <Text variant="caption" color={meta} style={{ fontSize: 11 }} testID="message-automated">
          {m.aiAgent ? 'AI agent ·' : 'Automated ·'}
        </Text>
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
          {`via ${m.sentVia} ·`}
        </Text>
      ) : null}
      {m.editedAt && !deleted ? (
        <Text variant="caption" color={meta} style={{ fontSize: 11 }}>
          edited
        </Text>
      ) : null}
      <Text variant="caption" color={meta} style={{ fontSize: 11 }}>
        {delivery === 'failed' ? 'Not sent · tap to retry' : time}
      </Text>
      {mine ? (
        <DeliveryIcon
          delivery={delivery}
          color={meta}
          readColor={mine && !card && t.bubble.fg === '#FFFFFF' ? '#FFD6E7' : t.c.accentStrong}
        />
      ) : null}
    </View>
  );

  const accessibleText = [
    mine ? 'You' : (senderName ?? ''),
    m.automated ? (m.aiAgent ? 'AI agent' : 'automated') : '',
    m.sentVia ? `sent via ${m.sentVia}` : '',
    deleted ? 'Message deleted' : (text ?? opened.note ?? sticker?.label ?? m.kind),
    time,
    delivery && mine ? delivery : '',
  ]
    .filter(Boolean)
    .join(', ');

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
          style={{ marginLeft: 12, marginBottom: 3 }}
        >
          {senderName}
        </Text>
      ) : null}
      <View
        style={{
          maxWidth: '82%',
          flexDirection: mine ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Pressable
          accessibilityRole="text"
          accessibilityLabel={accessibleText}
          accessibilityHint="Double tap and hold for actions"
          onLongPress={() => onLongPress?.(m)}
          onPress={delivery === 'failed' ? () => onRetry?.(m) : undefined}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
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
                label={sticker.label}
              />
              <Text variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
                {time}
              </Text>
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
              {content}
              {translation && !deleted ? (
                <TranslationBlock id={m.id} value={translation} fg={fg} meta={meta} />
              ) : null}
              {metaRow}
            </View>
          )}
        </Pressable>
        {hover && !deleted && onReply ? (
          <View style={{ flexDirection: mine ? 'row-reverse' : 'row', gap: 2 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reply"
              onPress={() => onReply(m)}
              onHoverIn={hoverIn}
              onHoverOut={hoverOut}
              hitSlop={6}
              style={{ padding: 6, borderRadius: 16, backgroundColor: t.c.surface }}
            >
              <CornerUpLeft size={16} color={t.c.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="React"
              onPress={() => onLongPress?.(m)}
              onHoverIn={hoverIn}
              onHoverOut={hoverOut}
              hitSlop={6}
              style={{ padding: 6, borderRadius: 16, backgroundColor: t.c.surface }}
            >
              <Smile size={16} color={t.c.textSecondary} />
            </Pressable>
          </View>
        ) : null}
      </View>
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
              accessibilityLabel={`${re.emoji} ${re.count}${re.mine ? ', including you' : ''}`}
              accessibilityState={{ selected: re.mine }}
              onPress={() => onReact?.(m, re.emoji)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 7,
                height: 24,
                borderRadius: 12,
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
