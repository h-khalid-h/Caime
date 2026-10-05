import type { ConversationView, MessageView } from '@caime/core/api';
import type { AppointmentBooking, PlacedOrder } from '@caime/core/booking';
import { customDetails, customMoves, customState, isCustomCard } from '@caime/core/custom-kits';
import { formatDue } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import {
  bookingDetails,
  isCardKit,
  kitDetails,
  kitMoves,
  kitStateLabel,
  kitStateTone,
  orderDetails,
} from '@caime/core/kit-cards';
import { KITS } from '@caime/core/kits';
import { PAYMENT_KIND_LABELS, type PayTo } from '@caime/core/payments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useCardAction } from '@/features/conversation/cardActions';
import { copyText } from '@/lib/clipboard';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { upsertMessage } from '@/state/cache';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button, type IconComponent } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Copy, ListChecks } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { AlbumCard } from './AlbumCard';
import { ChecklistCard } from './ChecklistCard';
import { iconNamed, KIT_ICONS } from './icons';
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
}

/**
 * A Pay card's payee and their ways (R62), as the server fixed them: what to copy, a link to
 * open. Nothing here moves money; the buttons below say what happened.
 */
function PayToBlock({ to }: { to: PayTo }) {
  return (
    <View style={{ gap: 6 }} testID="pay-to">
      <Text variant="caption" color="textSecondary">
        {tr('To {name}', { name: to.name })}
      </Text>
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
  const { timeZone, locale } = useUserClock();
  const meId = useSession((s) => s.user?.id ?? '');
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
            Due {formatDue(p.dueAt, now, timeZone, locale)}
          </Text>
        ) : null}
      </View>
    );
  }

  const kit = p.kit;
  if (kit === 'checklist') return <ChecklistCard m={m} mine={mine} />;
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
  if (kit === 'shared_album') return <AlbumCard m={m} mine={mine} />;
  if (kit === 'split') return <SplitCard m={m} mine={mine} />;
  // Agreed and ahead (R58): what to know before it, from the card.
  const start = (p.fields?.start as { at?: string } | undefined)?.at;
  const ahead =
    (kit === 'meeting' || kit === 'appointment') &&
    state === AGREED[kit] &&
    typeof start === 'string' &&
    new Date(start).getTime() > now.getTime() - 3_600_000;
  return (
    <CardBody
      m={m}
      Icon={KIT_ICONS[kit]}
      // The label kept on the card is the kit's name as a key: shown in the reader's language.
      label={tr(p.label ?? KITS[kit].name)}
      state={tr(kitStateLabel(state))}
      tone={kitStateTone(state)}
      title={p.title ?? ''}
      details={[
        ...kitDetails(kit, p.fields ?? {}, clock),
        ...(kit === 'appointment' ? bookingDetails(p.booking, clock.locale) : []),
        ...(kit === 'order_status' ? orderDetails(p.order) : []),
      ]}
      before={ahead ? { messageId: m.id, title: p.title ?? tr(KITS[kit].name) } : null}
      action={pay}
      extra={kit === 'payment_request' && p.payTo ? <PayToBlock to={p.payTo} /> : null}
      // In a conversation with an organization, the team is one side: anyone on it moves a card
      // the team sent, as the server has it.
      moves={
        m.deletedAt
          ? []
          : kitMoves(
              kit,
              state,
              mine || Boolean(thread?.customer && m.senderId !== thread.customer.id),
              p.fields,
            )
      }
      testID={`kit-${kit}`}
    />
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
  action = null,
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
  /** One more thing to do from the card (R62: Pay a priced order). */
  action?: { label: string; onPress: () => void; testID: string } | null;
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
      {moves.length || before || action ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
          {moves.map((move, i) => (
            <Button
              key={move.to}
              label={tr(move.label)}
              size="sm"
              variant={i === 0 ? 'primary' : 'secondary'}
              loading={busy === move.to}
              disabled={busy !== null}
              onPress={() => void go(move.to)}
            />
          ))}
          {action ? (
            <Button
              label={action.label}
              size="sm"
              variant={moves.length ? 'secondary' : 'primary'}
              onPress={action.onPress}
              testID={action.testID}
            />
          ) : null}
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
