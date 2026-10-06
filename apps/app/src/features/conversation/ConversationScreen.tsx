import type { MessageView } from '@caime/core/api';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { contextLine, formatDue, messagePreview, retentionText } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { canRemoveOthersMessages } from '@caime/core/permissions';
import { canPin } from '@caime/core/pins';
import { isSystemKind } from '@caime/core/system-ids';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Lock from 'lucide-react-native/icons/lock';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import PanelRight from 'lucide-react-native/icons/panel-right';
import Phone from 'lucide-react-native/icons/phone';
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
  View,
} from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useConversation, useMemory, useMessages } from '@/api/hooks';
import { qk } from '@/api/keys';
import { CATCH_UP_AFTER, CatchUpBanner } from '@/features/assist/CatchUpBanner';
import { catchUp } from '@/features/assist/catchUp';
import { useAiReady } from '@/features/assist/ready';
import { ThreadBar } from '@/features/business/ThreadBar';
import {
  callsSupported,
  groupCallsSupported,
  startCall,
  startGroupCall,
} from '@/features/calls/calls';
import { GroupCallBanner } from '@/features/calls/GroupCallBanner';
import { ConnectionBanner } from '@/features/common/ConnectionBanner';
import { useKnownPrivate } from '@/features/e2ee/hooks';
import { CodeChangedBanner, Downgraded, PrivateSheet } from '@/features/e2ee/parts';
import { privateSupported } from '@/features/e2ee/support';
import type { KitChoice, KitStart } from '@/features/kits/KitForm';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { useNow, useUserClock } from '@/lib/time';
import { leftConversation } from '@/realtime/apply';
import {
  flatMessages,
  type MessagePages,
  markInboxRead,
  maxSeq,
  upsertMessage,
} from '@/state/cache';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip, RelationshipChip } from '@/ui/Chip';
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
import { FirstWords } from './FirstWords';
import { ForwardSheet } from './ForwardSheet';
import { MessageActions, toggleReaction } from './MessageActions';
import { MessageBubble } from './MessageBubble';
import { PinnedBar } from './PinnedBar';
import { RequestBanner } from './RequestBanner';
import { buildRows, type Row } from './rows';
import { mayKeepFrom } from './SharedFiles';
import { SuggestionBar } from './SuggestionBar';
import { TypingIndicator, useTypingNames } from './TypingIndicator';

/** "How do you know …?" for a connection never labelled (R3), loaded the first time it opens. */
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
}: {
  id: string;
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
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [actionsFor, setActionsFor] = useState<MessageView | null>(null);
  const [forwarding, setForwarding] = useState<MessageView | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const composer = useRef<ComposerHandle>(null);
  const list = useRef<FlatList<Row>>(null);
  const typingNames = useTypingNames(conversation);
  const presence = useLive((s) =>
    conversation?.other ? s.presence[conversation.other.userId] : undefined,
  );

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
  const settledFor = useRef<string | null>(null);
  if (conversation && settledFor.current !== id) {
    unreadFrom.current =
      conversation.lastSeq > conversation.me.lastReadSeq ? conversation.me.lastReadSeq + 1 : null;
    unreadAtOpen.current = Math.max(0, conversation.lastSeq - conversation.me.lastReadSeq);
    if (conv.isFetchedAfterMount || readUpTo.current.seq > 0) settledFor.current = id;
  }
  const aiReady = useAiReady(conversation);
  const [catchUpDone, setCatchUpDone] = useState<string | null>(null);
  const offerCatchUp = aiReady && unreadAtOpen.current >= CATCH_UP_AFTER && catchUpDone !== id;

  const messages = useMemo(() => flatMessages(msgs.data), [msgs.data]);
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
          left={<IconButton icon={ArrowLeft} label={tr('Back')} onPress={() => router.back()} />}
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
            ? tr('Business · Verified · {verifiedDomain}', { verifiedDomain: org.verifiedDomain })
            : tr('Business · Not verified yet')
        : thread && org
          ? tr('Customer of {name}', { name: org.name })
          : other
            ? caimes
              ? other.person.trust.label
              : (presence ?? other.person.presence) === 'online'
                ? [tr('Online'), other.relationship?.label].filter(Boolean).join(' · ')
                : (other.relationship?.label ?? `@${other.person.handle}`)
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
            icon={ArrowLeft}
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
          callsSupported ? (
            // Calls (PRD §47): between two people who can already write to each other.
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
              icon={PanelRight}
              label={panel ? tr('Hide details') : tr('Show details')}
              onPress={() => setPanel((p) => !p)}
            />
          ) : null}
        </View>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('{text}{heading}, details', {
          text: ofGroup ? `${ofGroup} · ` : '',
          heading,
        })}
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
              borderRadius: 12,
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

  const start =
    conversation && !msgs.hasNextPage ? (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 24 }}>
        {org && !thread ? (
          <>
            <OrgMark kind={org.kind} url={org.avatarUrl} size={64} />
            <Text variant="headline" align="center">
              {org.name}
            </Text>
            <VerifiedLine org={org} />
            <Text variant="caption" color="textTertiary" align="center">
              {tr('A business conversation: {name}’s team answers as {name}.', { name: org.name })}
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
          <Text variant="captionStrong" color="accentStrong">
            {tr('New messages')}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: t.c.accent }} />
        </View>
      );
    return (
      <MessageBubble
        m={item.m}
        mine={item.mine}
        first={item.first}
        last={item.last}
        senderName={item.senderName}
        delivery={item.delivery}
        timeZone={timeZone}
        locale={locale}
        onLongPress={setActionsFor}
        onReply={onReply}
        onReact={onReact}
        onRetry={onRetry}
        highlighted={marked !== null && item.m.seq === marked}
        inertLinks={conversation?.request === 'incoming'}
        where={where}
      />
    );
  };

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
      <FlatList
        ref={list}
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        ListHeaderComponent={<TypingIndicator names={typingNames} />}
        ListFooterComponent={start}
        ListEmptyComponent={
          // A new connection with nothing said yet (PRD §87). The list is inverted, so what it
          // shows when empty is turned back the right way up.
          conversation &&
          !msgs.isPending &&
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
        onScroll={(e) => setAtBottom(e.nativeEvent.contentOffset.y < 120)}
        scrollEventThrottle={64}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        windowSize={11}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
      {!atBottom ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Jump to the newest message')}
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
        </Pressable>
      ) : null}
    </View>
  );

  const replyName = replyTo
    ? replyTo.senderId === me.id
      ? 'yourself'
      : (conversation?.participants.find((p) => p.userId === replyTo.senderId)?.person
          .displayName ?? null)
    : null;

  // Closed by a block (PRD §55): the customer blocked the organization.
  const closed = business?.closed ?? false;
  const disabled = business?.orgClosed
    ? tr(
        '{name} closed on Caime. What was sent here stays to read; find it again to start a new conversation.',
        { name: org?.name ?? tr('This organization') },
      )
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
    closed && !thread && org && !business?.orgClosed
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
            borderRadius: 12,
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
          {tr('{name} keeps this conversation for {retentionText}: messages go after that.', {
            name: org.name,
            retentionText: retentionText(business.retentionDays),
          })}
        </Text>
      ) : null}
      {conversation ? (
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
          replyName={replyName}
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
        onForward={setForwarding}
        // Nothing of a request is kept until it's accepted, nor once declined (the server's rule).
        canSave={conversation ? mayKeepFrom(conversation) : false}
        onClose={() => setActionsFor(null)}
        onReply={onReply}
        onEdit={(m) => {
          setReplyTo(null);
          setEditing(m);
          composer.current?.focus();
        }}
      />
      {forwarding ? <ForwardSheet m={forwarding} onClose={() => setForwarding(null)} /> : null}
      {labelled && other ? (
        <RelationshipPicker
          open={labelling}
          onClose={() => setLabelling(false)}
          person={{ id: other.userId, displayName: other.person.displayName }}
        />
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
