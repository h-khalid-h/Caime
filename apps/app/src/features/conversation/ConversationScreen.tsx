import type { MessageView } from '@caime/core/api';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { contextLine, formatDue, messagePreview, retentionText } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { lastSeenLine } from '@caime/core/last-seen';
import { canRemoveOthersMessages } from '@caime/core/permissions';
import { canPin } from '@caime/core/pins';
import { isSystemKind } from '@caime/core/system-ids';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Lock from 'lucide-react-native/icons/lock';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Phone from 'lucide-react-native/icons/phone';
import SearchIcon from 'lucide-react-native/icons/search';
import Tag from 'lucide-react-native/icons/tag';
import Users from 'lucide-react-native/icons/users';
import Video from 'lucide-react-native/icons/video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useConversation, useMemory, useMessages } from '@/api/hooks';
import { qk } from '@/api/keys';
import { CATCH_UP_AFTER, CatchUpBanner } from '@/features/assist/CatchUpBanner';
import { catchUp } from '@/features/assist/catchUp';
import { useAiReady } from '@/features/assist/ready';
import { AgentDraft } from '@/features/business/AgentDraft';
import { ThreadBar } from '@/features/business/ThreadBar';
import {
  callsSupported,
  groupCallsSupported,
  joinDirect,
  joinGroupMeeting,
  startCall,
  startGroupCall,
} from '@/features/calls/calls';
import { GroupCallBanner } from '@/features/calls/GroupCallBanner';
import { ConnectionBanner } from '@/features/common/ConnectionBanner';
import { useKnownPrivate } from '@/features/e2ee/hooks';
import { CodeChangedBanner, Downgraded, PrivateSheet } from '@/features/e2ee/parts';
import { privateSupported } from '@/features/e2ee/support';
import type { KitChoice, KitStart } from '@/features/kits/KitForm';
import { joinFromLink } from '@/features/kits/meetingCall';
import { PhotoViewerHost } from '@/features/media/PhotoViewerHost';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { handleOf } from '@/features/people/handleLine';
import { useNow, useUserClock } from '@/lib/time';
import { leftConversation } from '@/realtime/client';
import {
  flatMessages,
  type MessagePages,
  markInboxRead,
  maxSeq,
  upsertMessage,
} from '@/state/cache';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';
import { usePrivateReply } from '@/state/privateReply';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip, RelationshipChip } from '@/ui/Chip';
import { Back, Panel } from '@/ui/directional';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { lifted } from '@/ui/shadow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { Composer, type ComposerHandle } from './Composer';
import { ContextPanel } from './ContextPanel';
import { deleteWithUndo } from './deleteWithUndo';
import { FirstWords } from './FirstWords';
import { ForwardSheet } from './ForwardSheet';
import { forwardable, MessageActions, toggleReaction } from './MessageActions';
import { MessageBubble } from './MessageBubble';
import { mayKeepFrom } from './mayKeep';
import { PinnedBar } from './PinnedBar';
import { RequestBanner } from './RequestBanner';
import { buildRows, namesIn, type Row } from './rows';
import { SelectionBar } from './SelectionBar';
import { SuggestionBar } from './SuggestionBar';
import { SwipeToReply } from './SwipeToReply';
import { TypingIndicator, useTypingNames } from './TypingIndicator';
import { mailBound } from './topics';

/**
 * Past this many unread, a conversation opens at its newest with the count on its line (M16 E3):
 * loading back to the first of them would fetch page after page, and Cai's catch-up is offered.
 */
const UNREAD_JUMP_MAX = 150;

/** How long the date pill stays once the list is still (M16 E3). */
const PILL_MS = 1500;

/** Enough of a row showing for its day to be the one the pill says. */
const VIEWABLE = { itemVisiblePercentThreshold: 10 };

/** Shown only when a first load fails, so loaded then (M16 E1): kept out of the first download. */
const LoadFailed = lazyPart(() => import('@/ui/LoadFailed').then((m) => m.LoadFailed));

/** A group's join link (M16 C3e), for one just made with nobody yet: loaded when it opens. */
const JoinLinks = lazyPart(() => import('@/features/join/JoinLinks').then((m) => m.JoinLinks));

/** "How do you know …?" for a connection never labelled (R3), loaded the first time it opens. */
const ChatSearch = lazyPart(() => import('./ChatSearch').then((m) => m.ChatSearch));
const RelationshipPicker = lazyPart(() =>
  import('@/features/relationships/RelationshipPicker').then((m) => m.RelationshipPicker),
);

/**
 * `focusSeq` opens the conversation at one message (from search): older pages load until it's
 * there, the list scrolls to it, and it's marked for a moment.
 */
export function ConversationScreen({
  id,
  focusSeq,
  openKit = null,
  kitStart = null,
  checkout = null,
  say = null,
  join = null,
  inviteLink = false,
}: {
  /** A group just made with nobody yet (M16 C3e): its join link sheet, opened once. */
  inviteLink?: boolean;
  id: string;
  /** A meeting's card to join (R83), checked here before anything is called. */
  join?: string | null;
  focusSeq?: number;
  /** Words to start the composer with, to change before sending (Cai's follow-up, R68). */
  say?: string | null;
  /** Back from paying a Pay card by card (R65): that card, to ask Stripe about. */
  checkout?: string | null;
  /** Opened on a card's form: a Book or an Order link (R58, R60). */
  openKit?: KitChoice | null;
  /** What that form starts with: the item chosen (R61). */
  kitStart?: KitStart | null;
}) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const { desktop, wide, height } = useLayout();
  // Always confirmed on open: what the device kept may be behind (the unread line depends on it).
  const conv = useConversation(id, { refetchOnMount: 'always' });
  const msgs = useMessages(id);
  const conversation = conv.data?.conversation;
  const pendingAll = useOutbox((s) => s.items);
  const pending = useMemo(
    () => pendingAll.filter((i) => i.conversationId === id),
    [pendingAll, id],
  );
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [panel, setPanel] = useState(wide);
  const [details, setDetails] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  // Saying how you know them, from the conversation itself (R3): the sheet, once opened.
  const [labelling, setLabelling] = useState(false);
  const labelled = useOpened(labelling);
  const [privateInfo, setPrivateInfo] = useState(false);
  // Search inside this conversation (M16 E6): the sheet, once opened.
  const [searching, setSearching] = useState(false);
  const searched = useOpened(searching);
  const [inviting, setInviting] = useState(inviteLink);
  const invited = useOpened(inviting);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [actionsFor, setActionsFor] = useState<MessageView | null>(null);
  const [forwarding, setForwarding] = useState<MessageView[] | null>(null);
  // Several messages chosen together (M16 E8), kept for the conversation they were chosen in.
  const [chosen, setChosen] = useState<{ in: string; ms: Map<string, MessageView> } | null>(null);
  const selected = chosen?.in === id ? chosen.ms : null;
  const toggleChosen = (m: MessageView) =>
    setChosen((c) => {
      const ms = new Map(c?.in === id ? c.ms : []);
      if (ms.has(m.id)) ms.delete(m.id);
      else ms.set(m.id, m);
      // Letting go of the last one ends the choosing.
      return ms.size ? { in: id, ms } : null;
    });
  const [atBottom, setAtBottom] = useState(true);
  // The day of what's at the top, said over the list while it scrolls (M16 E3).
  const [pillDay, setPillDay] = useState<string | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const still = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (still.current) clearTimeout(still.current);
    },
    [],
  );
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
      // The list is inverted: what's at the top of the screen is the row furthest down the data.
      let top: Row | null = null;
      let at = -1;
      for (const v of viewableItems)
        if (v.index !== null && v.index > at) {
          at = v.index;
          top = v.item;
        }
      if (top?.type === 'message') setPillDay(top.day);
      else if (top?.type === 'day') setPillDay(top.label);
    },
  ).current;
  const composer = useRef<ComposerHandle>(null);
  const list = useRef<FlatList<Row>>(null);
  const typingNames = useTypingNames(conversation);
  const presence = useLive((s) =>
    conversation?.other ? s.presence[conversation.other.userId] : undefined,
  );
  // Seen going away while this device watched: fresher than the profile's "last seen" (M16 E3).
  const awayAt = useLive((s) =>
    conversation?.other ? s.awayAt[conversation.other.userId] : undefined,
  );
  // Gone while on screen: the head asks again when they were last here, as their privacy says,
  // rather than guessing it from a presence it may show without the time (M16 E3). One request a
  // departure, for the conversation open.
  useEffect(() => {
    if (presence === 'offline' || presence === 'away')
      void qc.invalidateQueries({ queryKey: qk.conversation(id) });
  }, [presence, id, qc]);

  useEffect(() => setPanel(wide), [wide]);

  // Cai's follow-up to change first (R68): into the composer once, then off the address.
  const said = useRef(false);
  useEffect(() => {
    if (!say || said.current || !composer.current) return;
    said.current = true;
    composer.current.insert(say);
    router.setParams({ say: undefined });
  });

  // Back from the organization's Stripe page (R65): what Stripe says now, once, on the card.
  const checked = useRef(false);
  useEffect(() => {
    if (!checkout || checked.current) return;
    checked.current = true;
    void endpoints
      .checkCheckout(checkout)
      .then((res) => {
        upsertMessage(qc, res.message);
        if (res.status === 'paid') toast(tr('Paid. The card says so.'));
      })
      .catch((e) => toast((e as Error).message, { tone: 'danger' }))
      .finally(() => router.setParams({ checkout: undefined }));
  }, [checkout, qc]);

  // Where "new messages" starts, and how many: taken from the first fresh copy of the
  // conversation (a copy restored on the device can be behind), then fixed, so the line doesn't
  // move as the person reads. Marking read on this screen fixes it too.
  const readUpTo = useRef({ id, seq: 0 });
  if (readUpTo.current.id !== id) readUpTo.current = { id, seq: 0 };
  const unreadFrom = useRef<number | null>(null);
  const unreadAtOpen = useRef(0);
  // The newest message seen at the bottom: what's newer and others' is what the jump button counts.
  const seenUpTo = useRef(0);
  const settledFor = useRef<string | null>(null);
  if (conversation && settledFor.current !== id) {
    unreadFrom.current =
      conversation.lastSeq > conversation.me.lastReadSeq ? conversation.me.lastReadSeq + 1 : null;
    unreadAtOpen.current = Math.max(0, conversation.lastSeq - conversation.me.lastReadSeq);
    seenUpTo.current = conversation.me.lastReadSeq;
    if (conv.isFetchedAfterMount || readUpTo.current.seq > 0) settledFor.current = id;
  }
  const aiReady = useAiReady(conversation);
  const [catchUpDone, setCatchUpDone] = useState<string | null>(null);
  const offerCatchUp = aiReady && unreadAtOpen.current >= CATCH_UP_AFTER && catchUpDone !== id;

  const messages = useMemo(() => flatMessages(msgs.data), [msgs.data]);
  // Joined from the calendar or a calendar app (R83): once the card is here, its call opens if
  // the card says it can be joined now; otherwise the conversation just opens at the card.
  const joinedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!join || joinedFor.current === join || !conversation) return;
    const card = messages.find((m) => m.id === join);
    if (!card) return;
    joinedFor.current = join;
    router.setParams({ join: undefined });
    const which = joinFromLink(
      card,
      conversation,
      { calls: callsSupported, groupCalls: groupCallsSupported },
      new Date(),
    );
    // A group's call that's on is joined rather than met with a second; one with Cai's notes
    // asked for or on joins nothing from an address, since the choice is the person's (the
    // card and the banner offer it: M16 F7c).
    if (which === 'group') void joinGroupMeeting(id);
    else if (which === 'direct') void joinDirect(id);
  }, [join, conversation, messages, id]);
  // A message arriving while the conversation is open is said to a screen reader (a list growing
  // says nothing by itself): who, and the preview, in a live region nobody sees. Only what came
  // after the screen opened, never the history.
  const [announce, setAnnounce] = useState('');
  const announcedUpTo = useRef<number | null>(null);
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest) return;
    if (announcedUpTo.current === null) {
      announcedUpTo.current = newest.seq;
      return;
    }
    if (newest.seq <= announcedUpTo.current || newest.senderId === me.id) return;
    announcedUpTo.current = newest.seq;
    const who = conversation?.participants.find((p) => p.userId === newest.senderId)?.person
      .displayName;
    const preview = messagePreview({
      kind: newest.kind,
      body: newest.body,
      payload: newest.payload,
      deleted: false,
      sealed: newest.sealed,
    });
    setAnnounce(who ? `${who}: ${preview}` : preview);
  }, [messages, me.id, conversation]);
  const [focus, setFocus] = useState<number | null>(focusSeq ?? null);
  const [marked, setMarked] = useState<number | null>(null);
  // Who a message here may name, for the bubble to mark them where they're written (M16 E3).
  const mentionables = useMemo(
    () =>
      conversation?.participants.map((p) => ({
        userId: p.userId,
        displayName: p.person.displayName,
        handle: p.person.handle,
      })),
    [conversation?.participants],
  );
  const rows = useMemo(
    () =>
      buildRows({
        messages,
        pending,
        conversation,
        me: me.id,
        unreadFrom: unreadFrom.current,
        now,
        timeZone,
        locale,
      }),
    [messages, pending, conversation, me.id, now, timeZone, locale],
  );

  useEffect(() => {
    if (focus === null || !msgs.data) return;
    if (!messages.some((m) => m.seq === focus)) {
      const oldest = messages[0]?.seq ?? 0;
      if (msgs.hasNextPage && oldest > focus) {
        if (!msgs.isFetchingNextPage) void msgs.fetchNextPage();
      } else {
        setFocus(null); // Deleted, or from before this person joined: stay at the newest.
      }
      return;
    }
    const index = rows.findIndex((r) => r.type === 'message' && r.m.seq === focus);
    if (index < 0) return;
    setFocus(null);
    setMarked(focus);
    requestAnimationFrame(() =>
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }),
    );
  }, [focus, msgs, messages, rows]);
  useEffect(() => {
    if (marked === null) return;
    const timer = setTimeout(() => setMarked(null), 2500);
    return () => clearTimeout(timer);
  }, [marked]);

  // Opened with unread messages (M16 E3): at the first of them, its line at the top, as a
  // messenger opens, once; older pages load down to it. Opened at a message (search, a pin) or
  // with more than a long read's worth, it opens where it was asked, or at the newest.
  const openedAtUnread = useRef<string | null>(null);
  // Opened at the first unread and not at the bottom since: what's below is still to be seen.
  const jumped = useRef(false);
  const newestSeq = messages[messages.length - 1]?.seq ?? 0;
  const newestShown = useRef(newestSeq);
  newestShown.current = newestSeq;
  useEffect(() => {
    if (openedAtUnread.current === id || settledFor.current !== id || !msgs.data) return;
    const from = unreadFrom.current;
    if (focusSeq || from === null || unreadAtOpen.current > UNREAD_JUMP_MAX) {
      openedAtUnread.current = id;
      jumped.current = false;
      return;
    }
    if ((messages[0]?.seq ?? 0) > from && msgs.hasNextPage) {
      if (!msgs.isFetchingNextPage) void msgs.fetchNextPage();
      return;
    }
    openedAtUnread.current = id;
    const index = rows.findIndex((r) => r.type === 'unread');
    jumped.current = index >= 0;
    if (index < 0) return;
    requestAnimationFrame(() =>
      list.current?.scrollToIndex({ index, viewPosition: 1, animated: false }),
    );
  }, [id, focusSeq, msgs, messages, rows]);

  // Marked unread to come back to (M16 E3b): opening it is coming back, once a visit.
  const unmarkedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!conversation?.me.markedUnread || unmarkedFor.current === id) return;
    unmarkedFor.current = id;
    markInboxRead(qc, id);
    void endpoints.updateConversation(id, { markedUnread: false }).catch(() => {});
  }, [conversation?.me.markedUnread, id, qc]);

  // At the bottom, everything there is seen: the jump button counts only what came after.
  useEffect(() => {
    if (atBottom && !jumped.current && openedAtUnread.current === id)
      seenUpTo.current = Math.max(seenUpTo.current, newestSeq);
  }, [atBottom, newestSeq, id]);

  // This conversation is on screen: arriving messages here are read, not unread.
  useFocusEffect(
    useCallback(() => {
      useLive.getState().setOpenConversation(id);
      return () => {
        if (useLive.getState().openConversationId === id)
          useLive.getState().setOpenConversation(null);
      };
    }, [id]),
  );

  // Mark read up to the newest message while visible (debounced; skips when nothing is new).
  const newest = maxSeq(msgs.data as MessagePages | undefined);
  useEffect(() => {
    if (!conversation || newest <= Math.max(readUpTo.current.seq, conversation.me.lastReadSeq))
      return;
    if (conversation.request === 'incoming') return; // Reading a request never tells the sender.
    const timer = setTimeout(() => {
      if (AppState.currentState !== 'active' && Platform.OS !== 'web') return;
      if (
        Platform.OS === 'web' &&
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      readUpTo.current = { id, seq: newest };
      markInboxRead(qc, id);
      void endpoints.receipts(id, { read: newest }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [newest, conversation, id, qc]);

  const other = conversation?.other;
  // Cai or a Caime Friend (R67): no calls, no labels, and what it is in place of a presence.
  const caimes = isSystemKind(other?.person.kind);
  // With an organization (R15): the customer sees who it is; its team sees the customer.
  const business = conversation?.business ?? null;
  const org = business?.org ?? null;
  const thread = business?.thread ?? null;
  const customer = thread?.customer ?? null;
  // The message a reply answers, from its quote (M16 E2): found and marked as search's jump is.
  const openReply = useCallback((m: MessageView) => {
    if (m.replyTo) setFocus(m.replyTo.seq);
  }, []);
  // Reply privately (M16 E3b): the chat with the one who wrote it, opened (made once if need be),
  // with the message quoted in its composer; the server checks both are in this group.
  const replyPrivately = useCallback(
    async (m: MessageView) => {
      if (!m.senderId || !conversation) return;
      try {
        const chat = (await endpoints.openDirect(m.senderId)).conversation;
        usePrivateReply.getState().set({
          in: chat.id,
          name: namesIn(conversation).get(m.senderId) ?? null,
          quote: {
            conversationId: conversation.id,
            messageId: m.id,
            title: conversation.title,
            seq: m.seq,
            senderId: m.senderId,
            preview: messagePreview({
              kind: m.kind,
              body: m.body,
              payload: m.payload,
              deleted: false,
            }),
          },
        });
        router.push({ pathname: '/c/[id]', params: { id: chat.id } });
      } catch (e) {
        toast((e as Error).message, { tone: 'danger' });
      }
    },
    [conversation],
  );
  const onReply = useCallback((m: MessageView) => {
    setEditing(null);
    setReplyTo(m);
    composer.current?.focus();
  }, []);
  const onReact = useCallback(
    (m: MessageView, emoji: string) => void toggleReaction(qc, m, emoji, me.id),
    [qc, me.id],
  );
  const onRetry = useCallback((m: MessageView) => useOutbox.getState().retry(m.id), []);
  // Seen as private here once, it stays private here, whatever's said of it now (R18).
  const saysPrivate = conversation?.privacyClass === 'private';
  const knownPrivate = useKnownPrivate(id, saysPrivate);
  const where = useMemo(
    () => ({ conversationId: id, private: saysPrivate || knownPrivate }),
    [id, saysPrivate, knownPrivate],
  );
  // A group at a glance (PRD §57): what it has gathered, not only how many are in it. Never a
  // private one's: the server keeps nothing of what's said there.
  const isGroup =
    conversation !== undefined &&
    conversation.kind !== 'direct' &&
    conversation.kind !== 'business';
  // Taken out of it (or left from another device) while it's open: it isn't theirs any more,
  // whatever this device kept of it, so nothing more of it is asked for or sent.
  const gone = conv.error instanceof ApiError && conv.error.status === 404;
  const gathered = useMemory(id, isGroup && !where.private && !gone).data;
  useEffect(() => {
    if (!gone) return;
    leftConversation(id);
    qc.removeQueries({ queryKey: qk.messages(id) });
    qc.removeQueries({ queryKey: qk.memory(id) });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  }, [gone, id, qc]);

  if (conv.isError && (!conversation || gone)) {
    return (
      <Screen>
        <TopBar
          left={<IconButton icon={Back} label={tr('Back')} onPress={() => router.back()} />}
          title={tr('Conversation')}
        />
        <EmptyState
          character="panda"
          expression="sad"
          icon={MessageCircle}
          title={tr('This conversation isn’t available')}
          body={(conv.error as Error).message}
        />
      </Screen>
    );
  }

  const privately = conversation?.privacyClass === 'private';
  // Who keeps messages at the top (core pins.ts): either person in a one-to-one, a group's
  // owner and admins.
  const pinner = conversation ? canPin(conversation.kind, conversation.me.role) : false;
  const groupLine =
    conversation && gathered
      ? contextLine({
          people: conversation.participants.length,
          decisions: gathered.counts.decisions,
          openItems: gathered.counts.openItems,
          files: gathered.counts.files,
          next: gathered.dates[0] ? formatDue(gathered.dates[0].at, now, timeZone, locale) : null,
        })
      : null;
  // When they were last here (M16 E3), only where their privacy shows it (the server's null
  // otherwise) and only while they aren't here now; seen going away here, that moment.
  const shownPresence = other ? (presence ?? other.person.presence) : null;
  const lastSeenAt =
    other?.person.lastSeenAt &&
    (shownPresence === 'away' || shownPresence === 'offline' || !shownPresence)
      ? Math.max(Date.parse(other.person.lastSeenAt) || 0, awayAt ?? 0)
      : 0;
  const lastSeen = lastSeenAt
    ? lastSeenLine(new Date(lastSeenAt).toISOString(), now, timeZone, locale)
    : '';
  // A topic goes by its own name; a group's says which group it's of (PRD §58).
  const heading = conversation?.topic ?? conversation?.title ?? '';
  const ofGroup = conversation?.topic && conversation.kind === 'group' ? conversation.title : null;
  const subtitle = privately
    ? typingNames.length
      ? tr('typing…')
      : [ofGroup, tr('Private · end to end encrypted')].filter(Boolean).join(' · ')
    : typingNames.length
      ? tr('typing…')
      : org && !thread
        ? business?.asOrg
          ? // Writing for an organization of theirs (R64): who they are here comes first.
            tr('As {name}', { name: business.asOrg.name })
          : org.verified
            ? tr('Verified business · {verifiedDomain}', { verifiedDomain: org.verifiedDomain })
            : tr('Organization · Not verified yet')
        : thread && org
          ? tr('Customer of {name}', { name: org.name })
          : other
            ? caimes
              ? other.person.trust.label
              : (presence ?? other.person.presence) === 'online'
                ? [tr('Online'), other.relationship?.label].filter(Boolean).join(' · ')
                : lastSeen
                  ? [lastSeen, other.relationship?.label].filter(Boolean).join(' · ')
                  : (other.relationship?.label ?? handleOf(other.person))
            : conversation
              ? [
                  ofGroup,
                  groupLine ?? trn(conversation.participants.length, '{n} person', '{n} people'),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '';

  const header = (
    <TopBar
      left={
        !desktop ? (
          <IconButton
            icon={Back}
            label={tr('Back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        ) : null
      }
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {other &&
          conversation?.kind === 'direct' &&
          !conversation.request &&
          !caimes &&
          !mailBound(conversation) &&
          callsSupported ? (
            // Calls (PRD §47): between two people who can already write to each other, and
            // nothing live with someone reached by mail (R75).
            <>
              <IconButton
                icon={Phone}
                label={tr('Voice call {displayName}', { displayName: other.person.displayName })}
                filled
                size={20}
                onPress={() => void startCall(conversation.id, 'voice')}
                testID="call-voice"
              />
              <IconButton
                icon={Video}
                label={tr('Video call {displayName}', { displayName: other.person.displayName })}
                filled
                size={20}
                onPress={() => void startCall(conversation.id, 'video')}
                testID="call-video"
              />
            </>
          ) : null}
          {org && !thread && business?.callable && conversation && callsSupported ? (
            // A customer calls the organization where it takes calls (M16 H8a): its team answers,
            // and the call is with the organization, never a person on it (R15).
            <>
              <IconButton
                icon={Phone}
                label={tr('Voice call {displayName}', { displayName: org.name })}
                filled
                size={20}
                onPress={() => void startCall(conversation.id, 'voice')}
                testID="call-voice"
              />
              <IconButton
                icon={Video}
                label={tr('Video call {displayName}', { displayName: org.name })}
                filled
                size={20}
                onPress={() => void startCall(conversation.id, 'video')}
                testID="call-video"
              />
            </>
          ) : null}
          {conversation?.kind === 'group' &&
          conversation.participants.length <= GROUP_CALL_MAX &&
          groupCallsSupported ? (
            // A group of up to eight: every device in the call connects to every other.
            <>
              <IconButton
                icon={Phone}
                label={tr('Voice call {heading}', { heading: heading || tr('the group') })}
                filled
                size={20}
                onPress={() => void startGroupCall(conversation.id, 'voice')}
                testID="group-call-voice"
              />
              <IconButton
                icon={Video}
                label={tr('Video call {heading}', { heading: heading || tr('the group') })}
                filled
                size={20}
                onPress={() => void startGroupCall(conversation.id, 'video')}
                testID="group-call-video"
              />
            </>
          ) : null}
          {conversation && !privately ? (
            <IconButton
              icon={SearchIcon}
              label={tr('Search this conversation')}
              onPress={() => setSearching(true)}
              testID="chat-search"
            />
          ) : null}
          {privately ? (
            <IconButton
              icon={Lock}
              label={tr('About this private conversation')}
              onPress={() => setPrivateInfo(true)}
              testID="private-info"
            />
          ) : null}
          {desktop ? (
            <IconButton
              icon={Panel}
              label={panel ? tr('Hide details') : tr('Show details')}
              onPress={() => setPanel((p) => !p)}
            />
          ) : null}
        </View>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          ofGroup
            ? tr('{group} · {heading}, details', { group: ofGroup, heading })
            : tr('{heading}, details', { heading })
        }
        onPress={() => {
          if (desktop) setPanel(true);
          else setDetails(true);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        {org && !thread ? (
          <OrgMark kind={org.kind} url={org.avatarUrl} size={38} />
        ) : customer ? (
          <Avatar id={customer.id} name={customer.displayName} url={customer.avatarUrl} size={38} />
        ) : other ? (
          <Avatar
            id={other.userId}
            name={other.person.displayName}
            url={other.person.avatarUrl}
            size={38}
            presence={presence ?? other.person.presence}
          />
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: t.radii.sm,
              backgroundColor: t.c.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={18} color={t.c.textSecondary} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1} auto>
            {heading}
          </Text>
          <Text
            variant="caption"
            color={typingNames.length ? 'accentStrong' : 'textSecondary'}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>
    </TopBar>
  );

  // The beginning is said only once the messages have loaded to it (M16 E1): while they load, or
  // when loading failed, it isn't the beginning of anything.
  const start =
    conversation && msgs.data && !msgs.hasNextPage ? (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 24 }}>
        {org && !thread ? (
          <>
            <OrgMark kind={org.kind} url={org.avatarUrl} size={64} />
            <Text variant="headline" align="center">
              {org.name}
            </Text>
            <VerifiedLine org={org} />
            <Text variant="caption" color="textTertiary" align="center">
              {tr('A conversation with an organization: its team answers as {name}.', {
                name: org.name,
              })}
            </Text>
            {business?.asOrg ? (
              <Text variant="caption" color="textSecondary" align="center" testID="writing-as-line">
                {tr('You write here for {name}: its payments go to its own ways to be paid.', {
                  name: business.asOrg.name,
                })}
              </Text>
            ) : null}
          </>
        ) : null}
        {other ? (
          <Avatar
            id={other.userId}
            name={other.person.displayName}
            url={other.person.avatarUrl}
            size={64}
          />
        ) : null}
        {org && !thread ? null : (
          <Text variant="headline" align="center">
            {conversation.topic ? conversation.topic : conversation.title}
          </Text>
        )}
        {org && !thread ? null : other?.relationship ? (
          <>
            <RelationshipChip
              label={other.relationship.label}
              sphere={other.relationship.sphere}
              size="md"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Lock size={11} color={t.c.textTertiary} />
              <Text variant="caption" color="textTertiary">
                {tr('Only you see how you’ve labelled {displayName}', {
                  displayName: other.person.displayName,
                })}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text variant="caption" color="textTertiary" align="center">
              {tr('This is the beginning of your conversation.')}
            </Text>
            {other &&
            conversation.kind === 'direct' &&
            conversation.connected === true &&
            !conversation.request ? (
              // Never labelled: the one tap that makes Caime theirs (R3), here, not in a panel.
              <Chip
                label={tr('How do you know {name}?', {
                  name: other.person.displayName.split(/\s+/)[0] ?? other.person.displayName,
                })}
                icon={Tag}
                onPress={() => setLabelling(true)}
                testID="label-relationship"
              />
            ) : null}
          </>
        )}
      </View>
    ) : msgs.isFetchingNextPage ? (
      <ActivityIndicator style={{ padding: 16 }} color={t.c.textTertiary} />
    ) : null;

  const renderItem = ({ item }: { item: Row }) => {
    if (item.type === 'day')
      return (
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text variant="captionStrong" color="textTertiary">
            {item.label}
          </Text>
        </View>
      );
    if (item.type === 'unread')
      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: t.c.accent }} />
          <Text variant="captionStrong" color="accentStrong" testID="unread-line">
            {trn(item.count, '{n} unread message', '{n} unread messages')}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: t.c.accent }} />
        </View>
      );
    const picked = selected?.has(item.m.id) ?? false;
    return (
      <View>
        <SwipeToReply
          onReply={() => onReply(item.m)}
          enabled={!selected && !item.m.deletedAt && item.m.kind !== 'system'}
        >
          <MessageBubble
            m={item.m}
            mine={item.mine}
            first={item.first}
            last={item.last}
            senderName={item.senderName}
            replyName={item.replyName}
            onOpenReply={openReply}
            privateReplyName={item.privateReplyName}
            onOpenReactions={setActionsFor}
            delivery={item.delivery}
            timeZone={timeZone}
            locale={locale}
            onLongPress={setActionsFor}
            onReply={onReply}
            onReact={onReact}
            onRetry={onRetry}
            highlighted={picked || (marked !== null && item.m.seq === marked)}
            inertLinks={conversation?.request === 'incoming'}
            // A request's photos come veiled (M16 B4): a tap shows them, under 18 accepting does.
            veil={conversation?.request === 'incoming' ? (me.minor ? 'accept' : 'tap') : undefined}
            where={where}
            mentionables={mentionables}
          />
        </SwipeToReply>
        {selected && !item.m.deletedAt && item.m.kind !== 'system' ? (
          // While choosing, a tap anywhere on the row takes it or lets it go.
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => toggleChosen(item.m)}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            accessibilityLabel={picked ? tr('Selected') : tr('Select')}
            testID={`select-${item.m.seq}`}
          />
        ) : null}
      </View>
    );
  };

  // Others' messages newer than the bottom last seen: what the jump button says (M16 E3).
  const below = atBottom
    ? 0
    : messages.filter(
        (m) => m.seq > seenUpTo.current && m.senderId !== me.id && m.kind !== 'system',
      ).length;
  const body = (
    <View style={{ flex: 1, backgroundColor: t.c.canvas }}>
      <ConnectionBanner />
      {conversation && privately ? (
        <CodeChangedBanner conversation={conversation} onOpen={() => setPrivateInfo(true)} />
      ) : null}
      {knownPrivate && !saysPrivate ? <Downgraded /> : null}
      {conversation?.kind === 'group' ? <GroupCallBanner conversationId={conversation.id} /> : null}
      {conversation && thread ? <ThreadBar conversation={conversation} thread={thread} /> : null}
      {conversation ? <RequestBanner conversation={conversation} /> : null}
      {conversation && conversation.kind !== 'business' ? (
        <PinnedBar where={where} canUnpin={pinner} onJump={(m) => setFocus(m.seq)} />
      ) : null}
      {offerCatchUp ? (
        <CatchUpBanner
          count={unreadAtOpen.current}
          onCatchUp={() => {
            setCatchUpDone(id);
            void catchUp(id);
            if (desktop) setPanel(true);
            else setDetails(true);
          }}
          onDismiss={() => setCatchUpDone(id)}
        />
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
        testID="new-message-announcer"
      >
        {announce}
      </Text>
      <View style={{ flex: 1 }}>
        <FlatList
          ref={list}
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          extraData={selected}
          ListHeaderComponent={<TypingIndicator names={typingNames} />}
          ListFooterComponent={
            // The list turns its header and footer the right way up itself.
            msgs.isError && !msgs.data ? (
              <LoadFailed
                title={tr('These messages couldn’t load')}
                error={msgs.error}
                onRetry={() => void msgs.refetch()}
                testID="conversation-load-failed"
              />
            ) : (
              start
            )
          }
          ListEmptyComponent={
            // A new connection with nothing said yet (PRD §87). The list is inverted, so what it
            // shows when empty is turned back the right way up.
            conversation &&
            msgs.data &&
            conversation.kind === 'direct' &&
            conversation.isGeneral &&
            conversation.other &&
            conversation.connected === true &&
            !conversation.request &&
            !privately ? (
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <FirstWords
                  conversation={conversation}
                  onPick={(line) => composer.current?.insert(line)}
                />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (msgs.hasNextPage && !msgs.isFetchingNextPage) void msgs.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          onScrollToIndexFailed={(info) => {
            // Not measured yet: get near it, then aim again once the rows around it have rendered.
            list.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(
              () =>
                list.current?.scrollToIndex({
                  index: info.index,
                  viewPosition: 0.5,
                  animated: false,
                }),
              120,
            );
          }}
          onScroll={(e) => {
            const bottom = e.nativeEvent.contentOffset.y < 120;
            setAtBottom(bottom);
            if (bottom) {
              jumped.current = false;
              seenUpTo.current = Math.max(seenUpTo.current, newestShown.current);
            }
            setScrolling(true);
            if (still.current) clearTimeout(still.current);
            still.current = setTimeout(() => setScrolling(false), PILL_MS);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABLE}
          scrollEventThrottle={64}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          windowSize={11}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
        {scrolling && !atBottom && pillDay ? (
          // The day of what's at the top while it scrolls (M16 E3), over the list, never in its way.
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 8, start: 0, end: 0, alignItems: 'center' }}
          >
            <View
              style={{
                backgroundColor: t.c.surface,
                borderRadius: t.radii.lg,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: t.c.border,
                ...lifted(t.c.shadow, 1, 6),
              }}
              testID="date-pill"
            >
              <Text variant="captionStrong" color="textSecondary">
                {pillDay}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      {!atBottom ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            below
              ? trn(
                  below,
                  'Jump to the newest message: {n} new below',
                  'Jump to the newest message: {n} new below',
                )
              : tr('Jump to the newest message')
          }
          onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{
            position: 'absolute',
            end: 16,
            bottom: 12,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: t.c.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: t.c.border,
            ...lifted(t.c.shadow, 2, 8),
          }}
        >
          <ChevronDown size={20} color={t.c.textSecondary} />
          {below ? (
            // What came since the bottom was last seen, others' only (M16 E3).
            <View
              style={{
                position: 'absolute',
                top: -6,
                end: -4,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 5,
                backgroundColor: t.c.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="jump-count"
            >
              <Text variant="captionStrong" color={t.c.onAccent} maxFontSizeMultiplier={1.2}>
                {below > 99 ? '99+' : String(below)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );

  // Whose words the reply answers, as a whole sentence in the reader's language (an English
  // "yourself" once sat inside every language's "Replying to …").
  const replyWriter = replyTo?.senderId ? namesIn(conversation).get(replyTo.senderId) : undefined;
  const replyTitle = !replyTo
    ? null
    : replyTo.senderId === me.id
      ? tr('Replying to yourself')
      : replyWriter
        ? tr('Replying to {replyName}', { replyName: replyWriter })
        : null;

  // Closed by a block (PRD §55): the customer blocked the organization.
  const closed = business?.closed ?? false;
  const disabled = conversation?.unverifiedSender
    ? tr(
        'Caime couldn’t confirm this mail came from {address}: it’s here to read, and nothing is sent from here.',
        { address: conversation.unverifiedSender },
      )
    : conversation?.notice
      ? tr('A notice by mail, from an address nobody answers: it’s here to read.')
      : business?.orgClosed
        ? tr(
            '{name} closed on Caime. What was sent here stays to read; find it again to start a new conversation.',
            { name: org?.name ?? tr('This organization') },
          )
        : business?.orgSuspended
          ? tr('Caime has suspended {name} for now. What was sent here stays to read.', {
              name: org?.name ?? tr('this organization'),
            })
          : closed
            ? thread
              ? tr('The customer closed this conversation.')
              : tr('You blocked {name}.', { name: org?.name ?? tr('this organization') })
            : conversation?.request === 'incoming'
              ? tr('Accept the request to reply.')
              : thread?.awaitingAcceptance
                ? tr('You can write again once they answer.')
                : conversation && !conversation.participants.some((p) => p.userId === me.id)
                  ? tr('You’re no longer in this conversation.')
                  : conversation?.privacyClass === 'private' && !privateSupported
                    ? tr(
                        'Private conversations don’t open on this device. Open Caime on your phone or in a current browser.',
                      )
                    : null;
  const disabledAction =
    closed && !thread && org && !business?.orgClosed && !business?.orgSuspended
      ? {
          label: tr('Unblock {name}', { name: org.name }),
          testID: 'composer-unblock-org',
          onPress: () =>
            void (async () => {
              try {
                await endpoints.unblockOrg(org.id);
                void qc.invalidateQueries({ queryKey: qk.conversation(id) });
                void qc.invalidateQueries({ queryKey: qk.allOrgs });
              } catch (e) {
                toast((e as Error).message, { tone: 'danger' });
              }
            })(),
        }
      : undefined;

  const main = (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {header}
      {body}
      <SuggestionBar conversationId={id} />
      {/* Its AI agent's draft, for the team to check before the customer reads it (M16 G6b). */}
      {thread && business?.agentDraft ? (
        <AgentDraft
          conversationId={id}
          draft={business.agentDraft}
          onEdit={(words) => composer.current?.insert(words)}
        />
      ) : null}
      {/* What's open between you here (R66): a line above the composer, opening the details. */}
      {conversation?.open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('What’s open here')}
          onPress={() => (desktop ? setPanel(true) : setDetails(true))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            marginHorizontal: 12,
            marginBottom: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: t.radii.sm,
            backgroundColor: t.c.surfaceMuted,
          }}
          testID="conversation-open"
        >
          <ListChecks size={14} color={t.c.textSecondary} />
          <Text variant="captionStrong" color="textSecondary">
            {[
              trn(conversation.open.count, '{n} open', '{n} open'),
              conversation.open.nextDueAt
                ? formatDue(conversation.open.nextDueAt, now, timeZone, locale)
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Pressable>
      ) : null}
      {/* The customer is told how long the organization keeps this (R54), where they write. */}
      {business?.retentionDays && !thread && org ? (
        <Text
          variant="caption"
          color="textTertiary"
          align="center"
          style={{ paddingHorizontal: 16, paddingBottom: 4 }}
          testID="business-retention"
        >
          {tr('{name} keeps this conversation for {period}: messages go after that.', {
            name: org.name,
            period: retentionText(business.retentionDays),
          })}
        </Text>
      ) : null}
      {conversation && selected ? (
        <SelectionBar
          chosen={[...selected.values()]}
          names={namesIn(conversation)}
          forwardable={!where.private && [...selected.values()].every(forwardable)}
          onCancel={() => setChosen(null)}
          onForward={() => {
            setForwarding([...selected.values()]);
            setChosen(null);
          }}
          onDelete={() => {
            deleteWithUndo(qc, [...selected.values()], false);
            setChosen(null);
          }}
        />
      ) : null}
      {conversation ? (
        // Kept while choosing, only out of sight, so what was being written stays as it was.
        <View style={selected ? { display: 'none' } : undefined}>
          <Composer
            ref={composer}
            key={id}
            conversation={conversation}
            where={where}
            openKit={openKit}
            kitStart={kitStart}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            editing={editing}
            onDoneEditing={() => setEditing(null)}
            disabled={disabled}
            disabledAction={disabledAction}
            replyTitle={replyTitle}
            placeholder={thread && org ? tr('Reply as {name}', { name: org.name }) : undefined}
            onEditLast={() => {
              const last = messages.findLast(
                (m) => m.senderId === me.id && m.kind === 'text' && m.deletedAt === null,
              );
              if (!last) return;
              setReplyTo(null);
              setEditing(last);
            }}
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']} surface>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0 }}>{main}</View>
        {desktop && panel && conversation ? (
          <View style={{ width: 340, borderStartWidth: 1, borderStartColor: t.c.border }}>
            <ContextPanel
              conversation={conversation}
              onClose={() => setPanel(false)}
              onJump={setFocus}
            />
          </View>
        ) : null}
      </View>
      {!desktop && conversation ? (
        <Sheet open={details} onClose={() => setDetails(false)} scroll={false}>
          <View style={{ height: height * 0.8 }}>
            <ContextPanel
              conversation={conversation}
              onClose={() => setDetails(false)}
              onJump={(seq) => {
                // The details are over the conversation here: they step aside for it.
                setDetails(false);
                setFocus(seq);
              }}
            />
          </View>
        </Sheet>
      ) : null}
      <MessageActions
        m={actionsFor}
        me={me.id}
        aiReady={aiReady}
        where={where}
        moderator={
          conversation ? canRemoveOthersMessages(conversation.kind, conversation.me.role) : false
        }
        canPin={pinner}
        onForward={(m) => setForwarding([m])}
        onSelect={(m) => setChosen({ in: id, ms: new Map([[m.id, m]]) })}
        // Nothing of a request is kept until it's accepted, nor once declined (the server's rule).
        canSave={conversation ? mayKeepFrom(conversation) : false}
        conversation={conversation}
        onReplyPrivately={
          // A group's message, never a private one's: its words never reach the server.
          conversation &&
          !where.private &&
          ['group', 'community', 'broadcast'].includes(conversation.kind)
            ? (m) => void replyPrivately(m)
            : undefined
        }
        onClose={() => setActionsFor(null)}
        onReply={onReply}
        onEdit={(m) => {
          setReplyTo(null);
          setEditing(m);
          composer.current?.focus();
        }}
      />
      {forwarding ? <ForwardSheet ms={forwarding} onClose={() => setForwarding(null)} /> : null}
      <PhotoViewerHost />
      {searched && conversation ? (
        <ChatSearch
          conversationId={conversation.id}
          open={searching}
          onClose={() => setSearching(false)}
          onJump={setFocus}
        />
      ) : null}
      {labelled && other ? (
        <RelationshipPicker
          open={labelling}
          onClose={() => setLabelling(false)}
          person={{
            id: other.userId,
            displayName: other.person.displayName,
            gender: other.person.gender,
          }}
        />
      ) : null}
      {conversation && invited ? (
        <Sheet
          open={inviting}
          onClose={() => {
            setInviting(false);
            router.setParams({ invite: undefined });
          }}
          title={conversation.title}
        >
          <JoinLinks target="group" id={conversation.id} name={conversation.title} />
        </Sheet>
      ) : null}
      {conversation && privately ? (
        <PrivateSheet
          conversation={conversation}
          open={privateInfo}
          onClose={() => setPrivateInfo(false)}
        />
      ) : null}
    </Screen>
  );
}
