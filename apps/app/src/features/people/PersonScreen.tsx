import type { RelationshipView } from '@caime/core/api';
import { formatClock, formatListTime, RHYTHM_TEXT } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePerson } from '@/api/hooks';
import { qk } from '@/api/keys';
import { PersonCalls } from '@/features/calls/PersonCalls';
import { OtherAccounts } from '@/features/duplicates';
import { privateSupported } from '@/features/e2ee/support';
import { openChatWith } from '@/features/inbox/openChat';
import { OrgMark } from '@/features/orgs/kinds';
import { PersonOffer } from '@/features/relationships/offers';
import { report } from '@/features/safety/report';
import { useNow, useUserClock } from '@/lib/time';
import { useLive } from '@/state/live';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { RelationshipChip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import {
  ArrowLeft,
  BadgeCheck,
  Flag,
  Hash,
  Lock,
  MessageCircle,
  Pencil,
  Shield,
  UserPlus,
  Users,
} from '@/ui/icons';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { PersonRule } from './PersonRule';
import { RelationshipHistory } from './RelationshipHistory';

/** One line of who someone is to you (PRD §67): what it is, and what there is of it. */
/** How they know them, and asking to connect: each in its sheet, loaded the first time it opens. */
const RelationshipPicker = lazyPart(() =>
  import('@/features/relationships/RelationshipPicker').then((m) => m.RelationshipPicker),
);
const ConnectSheet = lazyPart(() => import('./ConnectSheet').then((m) => m.ConnectSheet));

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function PersonScreen({ id }: { id: string }) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const q = usePerson(id);
  const presence = useLive((s) => s.presence[id]);
  const [picker, setPicker] = useState<{ open: boolean; current: RelationshipView | null }>({
    open: false,
    current: null,
  });
  const picking = useOpened(picker.open);
  const [connect, setConnect] = useState(false);
  const connecting = useOpened(connect);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const p = q.data;

  const refresh = () => {
    for (const key of [
      qk.person(id),
      qk.connections,
      qk.requests('incoming'),
      qk.requests('outgoing'),
      qk.inbox,
    ])
      void qc.invalidateQueries({ queryKey: key });
  };
  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast(done);
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const back = !desktop ? (
    <IconButton
      icon={ArrowLeft}
      label={tr('Back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
    />
  ) : null;

  if (q.isError && !p)
    return (
      <Screen>
        <TopBar left={back} title={tr('Profile')} />
        <EmptyState
          character="panda"
          expression="sad"
          icon={Users}
          title={tr('This profile isn’t available')}
          body={(q.error as Error).message}
        />
      </Screen>
    );
  if (!p) return <Screen>{<TopBar left={back} title="" />}</Screen>;

  const person = p.person;
  const self = person.id === me.id;
  const name = person.displayName.split(' ')[0] ?? person.displayName;
  const state = p.connection.state;

  const primaryAction = self ? null : state === 'connected' ? (
    <Button
      label={tr('Message')}
      icon={MessageCircle}
      size="lg"
      block
      onPress={() => {
        const general = p.conversations.find((c) => c.isGeneral);
        void openChatWith({ conversationId: general?.id ?? null, person });
      }}
      testID="person-message"
    />
  ) : state === 'incoming' ? (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button
        label={tr('Accept')}
        size="lg"
        style={{ flex: 1 }}
        block
        loading={busy === 'accept'}
        onPress={() =>
          act(
            'accept',
            () => endpoints.acceptRequest(p.connection.requestId ?? ''),
            tr('You’re connected with {name}', { name }),
          )
        }
      />
      <Button
        label={tr('Decline')}
        variant="secondary"
        size="lg"
        style={{ flex: 1 }}
        block
        loading={busy === 'decline'}
        onPress={() =>
          act(
            'decline',
            () => endpoints.declineRequest(p.connection.requestId ?? ''),
            'Declined. They won’t be told.',
          )
        }
      />
    </View>
  ) : state === 'outgoing' ? (
    <Button
      label={tr('Request sent · Cancel')}
      variant="secondary"
      size="lg"
      block
      loading={busy === 'cancel'}
      onPress={() =>
        act(
          'cancel',
          () => endpoints.cancelRequest(p.connection.requestId ?? ''),
          'Request cancelled',
        )
      }
    />
  ) : (
    <Button
      label={tr('Connect with {name}', { name })}
      icon={UserPlus}
      size="lg"
      block
      onPress={() => setConnect(true)}
      testID="person-connect"
    />
  );

  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar left={back} title={desktop ? '' : person.displayName} border={false} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
          gap: 16,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Avatar
            id={person.id}
            name={person.displayName}
            url={person.avatarUrl}
            size={104}
            presence={presence ?? person.presence}
          />
          <Text variant="title" align="center" auto>
            {person.displayName}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            @{person.handle}
            {person.pronouns ? ` · ${person.pronouns}` : ''}
          </Text>
          {person.statusText ? (
            <Text variant="body" align="center">
              {person.statusEmoji ? `${person.statusEmoji} ` : ''}
              {person.statusText}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {person.trust.level === 'org_verified' || person.trust.level === 'verified' ? (
              <BadgeCheck size={14} color={t.c.success} />
            ) : (
              <Shield size={14} color={t.c.textTertiary} />
            )}
            <Text variant="caption" color="textSecondary" accessibilityHint={person.trust.detail}>
              {/* The organization is named once, on its chip below (R43). */}
              {person.trust.level === 'org_verified' && p.organizations.length
                ? tr('Verified')
                : person.trust.label}
            </Text>
          </View>
          {p.organizations.length ? (
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}
              testID="person-orgs"
            >
              {p.organizations.map((o) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${o.name}, ${o.verified ? 'verified' : 'organization'}`}
                  onPress={() =>
                    router.navigate({ pathname: '/o/[handle]', params: { handle: o.handle } })
                  }
                  focusRadius={999}
                  testID={`person-org-${o.handle}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 4,
                    paddingStart: 4,
                    paddingEnd: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: t.c.border,
                    backgroundColor: t.c.surface,
                  }}
                >
                  <OrgMark kind={o.kind} url={o.avatarUrl} size={22} />
                  <Text variant="caption">{o.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {person.bio ? (
            <Text
              variant="body"
              color="textSecondary"
              align="center"
              style={{ maxWidth: 480 }}
              auto
            >
              {person.bio}
            </Text>
          ) : null}
        </View>

        {primaryAction}
        {state === 'connected' && privateSupported && !self ? (
          <Button
            label={tr('Private conversation')}
            icon={Lock}
            variant="secondary"
            block
            onPress={() =>
              void endpoints
                .openDirect(person.id, undefined, { private: true })
                .then(({ conversation }) =>
                  router.navigate({ pathname: '/c/[id]', params: { id: conversation.id } }),
                )
                .catch((e) => toast((e as Error).message, { tone: 'danger' }))
            }
            testID="person-private"
          />
        ) : null}

        {state === 'connected' && !self ? <PersonOffer person={person} /> : null}

        {!self ? (
          <Card>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="label" style={{ flex: 1 }}>
                  {tr('How you know {name}', { name })}
                </Text>
                {p.relationships.length ? (
                  <IconButton
                    icon={Pencil}
                    label={tr('Change')}
                    onPress={() => setPicker({ open: true, current: p.relationships[0] ?? null })}
                  />
                ) : null}
              </View>
              {p.relationships.length ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {p.relationships.map((r) => (
                    <RelationshipChip key={r.id} label={r.label} sphere={r.sphere} size="md" />
                  ))}
                </View>
              ) : (
                <Button
                  label={tr('Add how you know them')}
                  variant="secondary"
                  onPress={() => setPicker({ open: true, current: null })}
                  testID="person-classify"
                />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Lock size={12} color={t.c.textTertiary} />
                <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                  {p.relationships.some((r) => r.shared)
                    ? tr('Shared with {name}.', { name })
                    : tr(
                        'Only you see this. It shapes your notifications and priorities for {name}.',
                        { name },
                      )}
                </Text>
              </View>
              {p.mutual ? (
                <Text variant="caption" color="textSecondary">
                  {name}
                  {tr(' describes you as ')}
                  <Text variant="captionStrong">{p.mutual.theirLabel}</Text>
                  {p.mutual.fit === 'complementary'
                    ? tr(' — that fits.')
                    : p.mutual.fit === 'same'
                      ? tr(' too.')
                      : '.'}
                </Text>
              ) : null}
              {p.relationships.length ? (
                <Button
                  label={tr('Add another')}
                  variant="ghost"
                  size="sm"
                  onPress={() => setPicker({ open: true, current: null })}
                />
              ) : null}
            </View>
          </Card>
        ) : null}

        {state === 'connected' && !self && p.connection.connectionId ? (
          <PersonRule
            personId={id}
            name={name}
            connectionId={p.connection.connectionId}
            relationship={p.relationships[0]}
          />
        ) : null}

        {state === 'connected' && !self ? <OtherAccounts personId={id} name={name} /> : null}

        {!self ? <RelationshipHistory personId={id} name={name} /> : null}

        {state === 'connected' && !self ? (
          <Card>
            <View style={{ gap: 2 }} testID="person-profile">
              <Text variant="label" style={{ marginBottom: 4 }}>
                {tr('{name} and you', { name })}
              </Text>
              <Spec
                rows={[
                  p.busy
                    ? {
                        label: 'now',
                        value: `${p.busy.title ?? 'In a meeting'} until ${formatClock(p.busy.until, timeZone, locale)}`,
                        testID: 'person-busy',
                      }
                    : null,
                  {
                    label: 'conversation',
                    value: [
                      count(p.summary.messages, 'message', 'messages'),
                      p.summary.rhythm ? tr(RHYTHM_TEXT[p.summary.rhythm]).toLowerCase() : null,
                      p.summary.lastTalkedAt
                        ? `last ${formatListTime(p.summary.lastTalkedAt, now, timeZone, locale)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  },
                  p.summary.contexts.length
                    ? { label: 'context', value: p.summary.contexts.map((c) => c.title).join(', ') }
                    : null,
                  {
                    label: 'shared',
                    value: `${count(p.summary.files, 'file', 'files')} · ${count(p.summary.links, 'link', 'links')}${
                      p.summary.decisions
                        ? ` · ${count(p.summary.decisions, 'decision', 'decisions')}`
                        : ''
                    }`,
                  },
                  {
                    label: 'actions',
                    value: `${p.summary.openActions} open · ${p.summary.waiting} waiting`,
                  },
                  p.summary.theirAsks || p.summary.myAsks
                    ? {
                        label: 'answers',
                        value: [
                          p.summary.theirAsks
                            ? tr('{count} of {name}’s for you', {
                                count: count(p.summary.theirAsks, 'question', 'questions'),
                                name,
                              })
                            : null,
                          p.summary.myAsks
                            ? tr('{myAsks} of yours waiting on {name}', {
                                myAsks: p.summary.myAsks,
                                name,
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · '),
                        testID: 'person-asks',
                      }
                    : null,
                  {
                    label: 'privacy',
                    value:
                      p.summary.privacy === 'limited'
                        ? `${name} sees a limited view of you`
                        : 'Your privacy settings',
                  },
                ]}
              />
            </View>
          </Card>
        ) : null}

        {state === 'connected' ? <PersonCalls personId={id} name={name} /> : null}

        {p.conversations.length ? (
          <Card padded={false}>
            {p.conversations.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  icon={c.isGeneral ? MessageCircle : Hash}
                  title={c.title}
                  subtitle={c.isGeneral ? tr('Your main conversation') : tr('Topic')}
                  chevron
                  onPress={() => router.navigate({ pathname: '/c/[id]', params: { id: c.id } })}
                />
              </View>
            ))}
          </Card>
        ) : null}

        {!self ? (
          <Card padded={false}>
            <ListRow
              icon={Shield}
              title={p.blockedByMe ? tr('Unblock {name}', { name }) : tr('Block {name}', { name })}
              subtitle={
                p.blockedByMe ? undefined : tr('They won’t be able to message you or find you')
              }
              destructive={!p.blockedByMe}
              onPress={() =>
                act(
                  'block',
                  () => (p.blockedByMe ? endpoints.unblock(person.id) : endpoints.block(person.id)),
                  p.blockedByMe ? 'Unblocked' : tr('Blocked {name}', { name }),
                )
              }
            />
            <Divider inset={52} />
            <ListRow
              icon={Flag}
              title={tr('Report')}
              destructive
              onPress={() => report({ userId: person.id }, name)}
            />
          </Card>
        ) : null}
      </ScrollView>
      {picking ? (
        <RelationshipPicker
          open={picker.open}
          current={picker.current}
          onClose={() => setPicker({ open: false, current: null })}
          person={person}
        />
      ) : null}
      {connecting ? (
        <ConnectSheet
          open={connect}
          onClose={() => setConnect(false)}
          person={person}
          onSent={refresh}
        />
      ) : null}
    </Screen>
  );
}
