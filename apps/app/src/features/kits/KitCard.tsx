import type { ConversationView, MessageView } from '@caime/core/api';
import type { AppointmentBooking, PlacedOrder } from '@caime/core/booking';
import { notesAsked } from '@caime/core/calls';
import type { CardCheckout } from '@caime/core/checkout';
import { customDetails, customMoves, customState, isCustomCard } from '@caime/core/custom-kits';
import { formatDue } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import {
  askedBy,
  bookingDetails,
  isCardKit,
  kitDetails,
  kitMoves,
  kitStateLabel,
  kitStateTone,
  orderDetails,
  paySides,
} from '@caime/core/kit-cards';
import { KITS } from '@caime/core/kits';
import { answerOf, answersAmong, answersKept, changeBlock } from '@caime/core/meeting-changes';
import { cardEndMs, meetingAction, meetingLink } from '@caime/core/meetings';
import {
  PAYMENT_KIND_LABELS,
  type PaysShare,
  type PayTo,
  senderPays,
  standsAside,
} from '@caime/core/payments';
import { isRepeat } from '@caime/core/repeat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Copy from 'lucide-react-native/icons/copy';
import ListChecks from 'lucide-react-native/icons/list-checks';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import {
  callsSupported,
  groupCallsSupported,
  joinDirect,
  joinGroupMeeting,
} from '@/features/calls/calls';
import { joinWithCai } from '@/features/calls/notesWords';
import { useCardAction } from '@/features/conversation/cardActions';
import { copyText } from '@/lib/clipboard';
import { leaveFor, openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button, type IconComponent } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { AlbumCard } from './AlbumCard';
import { CardTime } from './CardTime';
import { ChecklistCard } from './ChecklistCard';
import { FormCard } from './FormCard';
import { iconNamed, KIT_ICONS } from './icons';
import { type MeetingCardPayload, MeetingGuests } from './MeetingGuests';
import { MeetingRepeat } from './MeetingRepeat';
import { meetingCall } from './meetingCall';
import { SplitCard } from './SplitCard';

interface CardPayload {
  kit?: unknown;
  label?: string;
  title?: string;
  state?: string;
  fields?: Record<string, unknown>;
  dueAt?: string | null;
  /** What an appointment booked from a catalog (R58). */
  booking?: AppointmentBooking | null;
  /** What an order took from a catalog (R60). */
  order?: PlacedOrder | null;
  /** Whom a priced booking or order is paid to (R62). */
  payee?: { kind: 'org' | 'person'; id: string } | null;
  /** A Pay card's payee and the ways the payer may see (R62). */
  payTo?: PayTo | null;
  /** Its checkout on the organization's own account (R65), as Stripe last said. */
  checkout?: CardCheckout | null;
  /** The split's share it pays, and whom (R62). */
  share?: PaysShare | null;
  /** Made of an invitation from someone's calendar (M16 F4): the answer goes back to it. */
  invitation?: unknown;
  /** Who suggested the time it has now (M16 F5): the other side answers it. */
  proposedBy?: string;
  movedTo?: unknown;
  history?: unknown[];
  /** A meeting that repeats (R58): its series. */
  series?: unknown;
  /** Each person's own answer in a group, and the round they answer (R123). */
  answers?: unknown;
  round?: unknown;
}

/** A long address said by its site: an invitation's Teams link runs to 300 characters (M16 F4). */
function shortPlace(d: { key: string; label: string; value: string }) {
  const host =
    d.key === 'place' && d.value.length > 60 ? /^https?:\/\/([^/?#]+)/i.exec(d.value)?.[1] : null;
  return host ? { ...d, value: host } : d;
}

/**
 * A Pay card's payee and their ways (R62), as the server fixed them: what to copy, a link to
 * open. Nothing here moves money; the buttons below say what happened.
 */
function PayToBlock({
  to,
  messageId,
  byCard,
  paidByCard,
}: {
  to: PayTo;
  messageId: string;
  /** This reader pays it, and may pay by card now (R65). */
  byCard: boolean;
  paidByCard: boolean;
}) {
  const [opening, setOpening] = useState(false);
  // On the organization's own Stripe page; the conversation checks what Stripe says on return.
  const payByCard = async () => {
    setOpening(true);
    try {
      leaveFor((await endpoints.payByCard(messageId)).url);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setOpening(false);
    }
  };
  return (
    <View style={{ gap: 6 }} testID="pay-to">
      <Text variant="caption" color="textSecondary">
        {tr('To {name}', { name: to.name })}
      </Text>
      {paidByCard ? (
        <Text variant="captionStrong" color="success" testID="pay-paid-by-card">
          {tr('Paid by card, through {name}’s own Stripe account', { name: to.name })}
        </Text>
      ) : byCard ? (
        <Button
          label={tr('Pay by card')}
          size="sm"
          loading={opening}
          onPress={() => void payByCard()}
          testID="pay-by-card"
        />
      ) : null}
      {to.note ? (
        <Text variant="caption" color="textSecondary" auto>
          {to.note}
        </Text>
      ) : null}
      {to.methods.map((way) => (
        <View
          key={way.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          testID={`pay-way-${way.id}`}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="captionStrong" auto>
              {way.label} · {tr(PAYMENT_KIND_LABELS[way.kind])}
            </Text>
            {way.details ? (
              <Text variant="caption" selectable auto>
                {way.details}
              </Text>
            ) : null}
          </View>
          {way.details ? (
            <IconButton
              icon={Copy}
              label={tr('Copy')}
              onPress={() =>
                void copyText(way.details ?? '').then((ok) => ok && toast(tr('Copied')))
              }
              testID={`pay-copy-${way.id}`}
            />
          ) : null}
          {way.url ? (
            <Button
              label={tr('Open')}
              size="sm"
              variant="secondary"
              onPress={() => openLink(way.url ?? '')}
              testID={`pay-open-${way.id}`}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** The brief before a meeting (R58), loaded when asked for. */
/** A paid Pay card's receipt (R62), loaded when asked for. */
// Each person's answer in a group (R123): with a group's meeting card alone.
const MeetingAnswers = lazyPart(() => import('./MeetingAnswers').then((x) => x.MeetingAnswers));
const ReceiptSheet = lazyPart(() => import('./ReceiptSheet').then((m) => m.ReceiptSheet));
const BriefSheet = lazyPart(() =>
  import('@/features/calendar/BriefSheet').then((m) => m.BriefSheet),
);
const AGREED: Record<string, string> = { meeting: 'accepted', appointment: 'confirmed' };

const TONE = { positive: 'success', negative: 'danger', neutral: 'neutral' } as const;

/**
 * A Connect Kit card in a conversation: what it is, where it stands, and the moves this person
 * can make on it (core kit-cards.ts). An organization's own kinds of card read and move as the
 * kit they were sent with (custom-kits.ts). The server's request cards (a task asked of
 * someone) read the same way, and change from Actions.
 */
export function KitCard({ m, mine }: { m: MessageView; mine: boolean }) {
  const t = useTheme();
  const now = useNow();
  // In a conversation with an organization, whether this person is on its team (the team's view
  // of it has its thread), followed as the conversation loads: never fetched from here.
  const thread = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) => d.conversation.business?.thread ?? null,
  }).data;
  // Which call a meeting's Join opens here (R83), from the same cached conversation.
  const call = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) =>
      meetingCall(d.conversation, { calls: callsSupported, groupCalls: groupCallsSupported }),
  }).data;
  // Whether a meeting here may have guests (R84): a person's own conversation, not private.
  const guestable = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) =>
      (d.conversation.kind === 'direct' || d.conversation.kind === 'group') &&
      d.conversation.privacyClass === 'standard' &&
      !d.conversation.business,
  }).data;
  const { timeZone, locale } = useUserClock();
  const meId = useSession((s) => s.user?.id ?? '');
  // In a group a Pay card is between whoever paid and was paid (R62): its receipt is theirs. A
  // group short of a crowd keeps each person's own answer to a meeting (R123).
  const group = useQuery({
    queryKey: qk.conversation(m.conversationId),
    queryFn: () => endpoints.conversation(m.conversationId),
    enabled: false,
    select: (d: { conversation: ConversationView }) =>
      d.conversation.kind === 'group'
        ? answersKept(
            d.conversation.kind,
            d.conversation.participants.filter((x) => x.person.kind === 'human').length,
          )
          ? 'answers'
          : 'crowd'
        : null,
  }).data;
  const inGroup = group !== null && group !== undefined;
  // Cai's notes (M16 F7c): whether this person may ask for them (an adult with AI assist on),
  // and whether they're asked for or on in this conversation's call right now.
  const mayAskNotes = useSession((s) => Boolean(s.user?.aiEnabled && !s.user.minor));
  const groupNotes = useGroupCall((s) => s.on[m.conversationId]?.notes?.state ?? null);
  const directNotes = useCall((s) =>
    s.call?.conversationId === m.conversationId ? (s.call.notes?.state ?? null) : null,
  );
  const liveNotes = call === 'group' ? groupNotes : call === 'direct' ? directNotes : null;
  // Recorded too (R114): every way in names it.
  const groupRecords = useGroupCall((s) => s.on[m.conversationId]?.notes?.records === true);
  const directRecords = useCall(
    (s) => s.call?.conversationId === m.conversationId && s.call.notes?.records === true,
  );
  const liveRecords = call === 'group' ? groupRecords : call === 'direct' && directRecords;
  // Joining in too (R114 (3)): the same.
  const groupInteracts = useGroupCall((s) => s.on[m.conversationId]?.notes?.interacts === true);
  const directInteracts = useCall(
    (s) => s.call?.conversationId === m.conversationId && s.call.notes?.interacts === true,
  );
  const liveInteracts = call === 'group' ? groupInteracts : call === 'direct' && directInteracts;
  const notesLive = notesAsked(liveNotes ? { state: liveNotes } : null);
  // Never opened is null: the sheet loads the first time it's asked for.
  const [receiptOpen, setReceiptOpen] = useState<boolean | null>(null);
  const clock = { now, timeZone, locale };
  const p = (m.payload ?? {}) as CardPayload;
  const state = p.state ?? '';

  if (isCustomCard(m.payload)) {
    const card = m.payload;
    // Its moves are the organization's (its team's) or its customer's: none until it's known
    // which this person is.
    const at = customState(card);
    return (
      <CardBody
        m={m}
        Icon={iconNamed(card.icon)}
        label={card.label}
        state={at.label}
        tone={at.tone}
        title={card.title}
        details={customDetails(card, clock)}
        moves={m.deletedAt || thread === undefined ? [] : customMoves(card, thread !== null)}
        from={card.app.name}
        testID={`kit-custom-${card.key}`}
      />
    );
  }

  if (!isCardKit(p.kit)) {
    return (
      <View style={{ gap: 6, minWidth: 220 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ListChecks size={16} color={t.c.accentStrong} />
          <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
            {tr('Request')}
          </Text>
          {state ? (
            <Chip label={tr(kitStateLabel(state))} tone={TONE[kitStateTone(state)]} size="sm" />
          ) : null}
        </View>
        <Text variant="bodyStrong">{p.title ?? tr('Request')}</Text>
        {p.dueAt ? (
          <Text variant="caption" color="textSecondary">
            {tr('Due {when}', { when: formatDue(p.dueAt, now, timeZone, locale) })}
          </Text>
        ) : null}
      </View>
    );
  }

  const kit = p.kit;
  if (kit === 'checklist') return <ChecklistCard m={m} mine={mine} />;
  if (kit === 'form') return <FormCard m={m} thread={thread} />;
  // Pay (R62): a priced booking or order offers it to whoever pays: an organization's customer,
  // or whoever isn't the person paid; it opens the Pay card's form, filled and replying here.
  const due =
    kit === 'order_status' ? p.order?.total : kit === 'appointment' ? p.booking?.price : null;
  const pays =
    Boolean(due && p.payee) &&
    !['cancelled', 'declined'].includes(state) &&
    !m.deletedAt &&
    (p.payee?.kind === 'org' ? thread === null : p.payee?.id !== meId);
  const pay = pays
    ? {
        label: tr('Pay'),
        testID: 'kit-pay',
        onPress: () =>
          useCardAction.setState({
            request: {
              conversationId: m.conversationId,
              kit: 'payment_request',
              start: {
                direction: 'send',
                amount: due ?? undefined,
                note: [p.label ?? tr(KITS[kit].name), p.fields?.reference]
                  .filter((x) => typeof x === 'string' && x)
                  .join(' ')
                  .slice(0, 200),
                replyToId: m.id,
              },
            },
          }),
      }
    : null;
  // A meeting (R83): Join its call while it can be joined, when held here; Open its link, when
  // held on another service. A priced card's Pay comes first; meetings carry no price.
  const held = m.deletedAt ? null : meetingAction(p, now);
  const place = typeof p.fields?.place === 'string' ? p.fields.place : '';
  const join = (notes?: 'yes' | 'no') =>
    void (call === 'group'
      ? joinGroupMeeting(m.conversationId, notes)
      : joinDirect(m.conversationId, notes));
  // With Cai or without (M16 F7c, R85 (1)): a meeting that says Cai takes notes, to whoever may
  // ask for them, and any meeting whose call has them asked for or on, since a plain Join there
  // would stop them for everyone.
  const meeting =
    held === 'join' && call
      ? notesLive || (p.fields?.notes === 'cai' && mayAskNotes)
        ? [
            {
              label: joinWithCai(
                notesLive ? { records: liveRecords, interacts: liveInteracts } : null,
              ),
              testID: 'kit-join-with-notes',
              onPress: () => join('yes'),
            },
            {
              label: tr('Join without Cai'),
              testID: 'kit-join-without-notes',
              onPress: () => join('no'),
            },
          ]
        : [{ label: tr('Join'), testID: 'kit-join', onPress: () => join() }]
      : held === 'open' && place
        ? [{ label: tr('Open'), testID: 'kit-open', onPress: () => openLink(meetingLink(place)) }]
        : null;
  // Paid (R62, R65): its receipt, for its two sides (the server says the same).
  const sides = paySides(p as Parameters<typeof paySides>[0], m.senderId, null);
  const receipt =
    kit === 'payment_request' &&
    state === 'paid' &&
    !m.deletedAt &&
    (!inGroup || meId === sides.payerId || meId === sides.payeeId)
      ? { label: tr('Receipt'), testID: 'kit-receipt', onPress: () => setReceiptOpen(true) }
      : null;
  // In a conversation with an organization, the team is one side: anyone on it moves a card
  // the team asked for, as the server has it. A card asks of whoever didn't suggest its time as
  // it stands (M16 F5: its sender, or who suggested another since).
  const asker = askedBy(p, m.senderId);
  const senderSide = asker === meId || Boolean(thread?.customer && asker !== thread.customer.id);
  if (kit === 'shared_album') return <AlbumCard m={m} mine={mine} />;
  if (kit === 'split') return <SplitCard m={m} mine={mine} />;
  // A meeting's organizer changes it (R123): from its card, while it's asked or on, not over.
  const organizer = kit === 'meeting' ? askedBy(p, m.senderId) : null;
  const startAt = Date.parse((p.fields?.start as { at?: string } | undefined)?.at ?? '');
  const endsAt = Number.isFinite(startAt)
    ? cardEndMs(startAt, { durationMinutes: p.fields?.durationMinutes })
    : null;
  const changeable = kit === 'meeting' && !m.deletedAt && changeBlock(p, endsAt, now) === null;
  const organizes = kit === 'meeting' && senderSide;
  const change = (at?: string) =>
    useCardAction.setState({
      request: {
        conversationId: m.conversationId,
        kit: 'meeting',
        start: {
          edit: {
            messageId: m.id,
            fields: p.fields ?? {},
            series: Boolean(p.series) && isRepeat(p.fields?.repeat),
            ...(at ? { at } : {}),
          },
        },
      },
    });
  const edit =
    changeable && organizes
      ? { label: tr('Edit'), testID: 'kit-edit', onPress: () => change() }
      : null;
  // In a group that keeps answers, everyone else answers for themselves (R123).
  const answers = kit === 'meeting' && group === 'answers';
  // Agreed and ahead (R58): what to know before it, from the card.
  const start = (p.fields?.start as { at?: string } | undefined)?.at;
  const ahead =
    (kit === 'meeting' || kit === 'appointment') &&
    state === AGREED[kit] &&
    typeof start === 'string' &&
    new Date(start).getTime() > now.getTime() - 3_600_000;
  return (
    <>
      <CardBody
        m={m}
        Icon={KIT_ICONS[kit]}
        // The label kept on the card is the kit's name as a key: shown in the reader's language.
        label={tr(p.label ?? KITS[kit].name)}
        state={tr(kitStateLabel(state))}
        tone={kitStateTone(state)}
        title={p.title ?? ''}
        details={[
          ...kitDetails(kit, p.fields ?? {}, clock).map(shortPlace),
          ...(kit === 'appointment' ? bookingDetails(p.booking, clock.locale) : []),
          ...(kit === 'order_status' ? orderDetails(p.order) : []),
        ]}
        before={ahead ? { messageId: m.id, title: p.title ?? tr(KITS[kit].name) } : null}
        actions={
          pay ? [pay] : [...(meeting ?? (receipt ? [receipt] : [])), ...(edit ? [edit] : [])]
        }
        // A meeting that can be joined now leads with Join (R83), never with Cancel.
        lead={!pay && held === 'join' && Boolean(meeting)}
        extra={
          kit === 'payment_request' && p.payTo ? (
            <PayToBlock
              to={p.payTo}
              messageId={m.id}
              byCard={Boolean(
                p.payTo.checkout &&
                  !m.deletedAt &&
                  // Its payer: the other side of an ask, the sender of a send (as the server has it).
                  (senderPays(p.fields) ? senderSide : !senderSide) &&
                  (state === 'requested' ||
                    state === 'not_received' ||
                    (state === 'sent' && senderPays(p.fields) && !p.history?.length)),
              )}
              paidByCard={p.checkout?.status === 'paid'}
            />
          ) : kit === 'appointment' ? (
            <>
              <CardTime m={m} card={p} />
              <MeetingRepeat m={m} card={p} />
            </>
          ) : kit === 'meeting' ? (
            <>
              {p.invitation && state === 'proposed' && !m.deletedAt ? (
                <Text variant="caption" color="textSecondary" testID="kit-invitation">
                  {tr('Your answer goes back to the calendar that sent it.')}
                </Text>
              ) : null}
              {answers ? (
                <MeetingAnswers
                  m={m}
                  organizer={organizer}
                  open={changeable}
                  mine={answerOf(p, meId)}
                  amongOf={(others) => answersAmong(p, others)}
                  onUseTime={(at) => change(at)}
                />
              ) : null}
              {/* Its organizer changes it with Edit (R123); in a group everyone else answers. */}
              {organizes || answers ? null : <CardTime m={m} card={p} />}
              {/* Stopping a group's series changes when it is: its organizer's, as Edit is. */}
              {answers && !organizes ? null : (
                <MeetingRepeat m={m} card={p as MeetingCardPayload} />
              )}
              <MeetingGuests
                messageId={m.id}
                card={p as MeetingCardPayload}
                deleted={Boolean(m.deletedAt)}
                where={Boolean(guestable)}
              />
            </>
          ) : null
        }
        // In a conversation with an organization, the team is one side: anyone on it moves a card
        // the team sent, as the server has it.
        // A share's Pay card in a group (R62) is its two sides' alone: the rest only look on.
        moves={
          m.deletedAt || standsAside(p, meId, m.senderId)
            ? []
            : answers
              ? // Its organizer alone calls a group's meeting off (R123).
                organizes
                ? kitMoves(kit, state, senderSide, p.fields).filter((x) => x.to === 'cancelled')
                : []
              : kitMoves(kit, state, senderSide, p.fields)
        }
        testID={`kit-${kit}`}
      />
      {receiptOpen !== null ? (
        <ReceiptSheet messageId={m.id} open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      ) : null}
    </>
  );
}

/** What a card says, and the buttons for the moves this person may make on it. */
function CardBody({
  m,
  Icon,
  label,
  state,
  tone,
  title,
  details,
  moves,
  from,
  before,
  actions = [],
  lead = false,
  extra = null,
  testID,
}: {
  m: MessageView;
  Icon: IconComponent;
  label: string;
  state: string;
  tone: keyof typeof TONE;
  title: string;
  details: Array<{ key: string; label: string; value: string }>;
  moves: Array<{ to: string; label: string }>;
  /** The organization's app whose kind of card it is. */
  from?: string;
  /** An agreed meeting ahead (R58): the brief opens from here. */
  before?: { messageId: string; title: string } | null;
  /**
   * What else to do from the card (R62: Pay a priced order; R83: Join a meeting, with Cai or
   * without when its notes are asked for: M16 F7c), the first of them the main one.
   */
  actions?: Array<{ label: string; onPress: () => void; testID: string }>;
  /** The actions come before the moves (a meeting that can be joined now: Join, not Cancel). */
  lead?: boolean;
  /** What the card shows beneath its lines (R62: whom a Pay card pays, and how). */
  extra?: React.ReactNode;
  testID: string;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const go = async (to: string) => {
    setBusy(to);
    try {
      const res = await endpoints.moveKit(m.id, to);
      upsertMessage(qc, res.message);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {label}
        </Text>
        <Chip label={state} tone={TONE[tone]} size="sm" />
      </View>
      <Text variant="bodyStrong">{title}</Text>
      {details.length ? (
        <View style={{ gap: 3 }}>
          {details.map((d) => (
            <View key={d.key} style={{ flexDirection: 'row', gap: 10 }}>
              <Text variant="caption" color="textTertiary" style={{ width: 76 }}>
                {d.label}
              </Text>
              <Text variant="caption" style={{ flex: 1 }}>
                {d.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {extra}
      {from ? (
        <Text variant="caption" color="textTertiary">
          {tr('From {from}', { from })}
        </Text>
      ) : null}
      {moves.length || before || actions.length ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
          {lead
            ? actions.map((action, i) => (
                <Button
                  key={action.testID}
                  label={action.label}
                  size="sm"
                  variant={i === 0 ? 'primary' : 'secondary'}
                  onPress={action.onPress}
                  testID={action.testID}
                />
              ))
            : null}
          {moves.map((move, i) => (
            <Button
              key={move.to}
              label={tr(move.label)}
              size="sm"
              variant={i === 0 && !(lead && actions.length) ? 'primary' : 'secondary'}
              loading={busy === move.to}
              disabled={busy !== null}
              onPress={() => void go(move.to)}
            />
          ))}
          {lead
            ? null
            : actions.map((action, i) => (
                <Button
                  key={action.testID}
                  label={action.label}
                  size="sm"
                  variant={moves.length || i > 0 ? 'secondary' : 'primary'}
                  onPress={action.onPress}
                  testID={action.testID}
                />
              ))}
          {before ? (
            <Button
              label={tr('Before it')}
              size="sm"
              variant="ghost"
              onPress={() => setBriefOpen(true)}
              testID="kit-brief"
            />
          ) : null}
        </View>
      ) : null}
      {before && briefOpen ? (
        <BriefSheet
          messageId={before.messageId}
          title={before.title}
          onClose={() => setBriefOpen(false)}
        />
      ) : null}
    </View>
  );
}
