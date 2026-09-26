import type { RelationshipView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePerson } from '@/api/hooks';
import { qk } from '@/api/keys';
import { openChatWith } from '@/features/inbox/NewChatSheet';
import { RelationshipPicker } from '@/features/relationships/RelationshipPicker';
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
import { ListRow } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { ConnectSheet } from './ConnectSheet';
import { RelationshipHistory } from './RelationshipHistory';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 2 }}>
      <Text variant="headline">{value}</Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

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
  const [connect, setConnect] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
    />
  ) : null;

  if (q.isError && !p)
    return (
      <Screen>
        <TopBar left={back} title="Profile" />
        <EmptyState
          character="panda"
          expression="sad"
          icon={Users}
          title="This profile isn’t available"
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
      label="Message"
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
        label="Accept"
        size="lg"
        style={{ flex: 1 }}
        block
        loading={busy === 'accept'}
        onPress={() =>
          act(
            'accept',
            () => endpoints.acceptRequest(p.connection.requestId ?? ''),
            `You’re connected with ${name}`,
          )
        }
      />
      <Button
        label="Decline"
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
      label="Request sent · Cancel"
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
      label={`Connect with ${name}`}
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
              {person.trust.label}
            </Text>
          </View>
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

        {!self ? (
          <Card>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="label" style={{ flex: 1 }}>
                  How you know {name}
                </Text>
                {p.relationships.length ? (
                  <IconButton
                    icon={Pencil}
                    label="Change"
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
                  label="Add how you know them"
                  variant="secondary"
                  onPress={() => setPicker({ open: true, current: null })}
                  testID="person-classify"
                />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Lock size={12} color={t.c.textTertiary} />
                <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                  {p.relationships.some((r) => r.shared)
                    ? `Shared with ${name}.`
                    : `Only you see this. It shapes your notifications and priorities for ${name}.`}
                </Text>
              </View>
              {p.mutual ? (
                <Text variant="caption" color="textSecondary">
                  {name} describes you as <Text variant="captionStrong">{p.mutual.theirLabel}</Text>
                  {p.mutual.fit === 'complementary'
                    ? ' — that fits.'
                    : p.mutual.fit === 'same'
                      ? ' too.'
                      : '.'}
                </Text>
              ) : null}
              {p.relationships.length ? (
                <Button
                  label="Add another"
                  variant="ghost"
                  size="sm"
                  onPress={() => setPicker({ open: true, current: null })}
                />
              ) : null}
            </View>
          </Card>
        ) : null}

        {!self ? <RelationshipHistory personId={id} name={name} /> : null}

        {state === 'connected' ? (
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <Stat value={p.summary.messages} label="Messages" />
              <Stat value={p.summary.files} label="Files" />
              <Stat value={p.summary.decisions} label="Decisions" />
              <Stat value={p.summary.openActions} label="Open" />
            </View>
          </Card>
        ) : null}

        {p.conversations.length ? (
          <Card padded={false}>
            {p.conversations.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  icon={c.isGeneral ? MessageCircle : Hash}
                  title={c.title}
                  subtitle={c.isGeneral ? 'Your main conversation' : 'Topic'}
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
              title={p.blockedByMe ? `Unblock ${name}` : `Block ${name}`}
              subtitle={p.blockedByMe ? undefined : 'They won’t be able to message you or find you'}
              destructive={!p.blockedByMe}
              onPress={() =>
                act(
                  'block',
                  () => (p.blockedByMe ? endpoints.unblock(person.id) : endpoints.block(person.id)),
                  p.blockedByMe ? 'Unblocked' : `Blocked ${name}`,
                )
              }
            />
            <Divider inset={52} />
            <ListRow
              icon={Flag}
              title="Report"
              destructive
              onPress={() =>
                act(
                  'report',
                  () => endpoints.report({ userId: person.id, reason: 'other' }),
                  'Reported. Thank you.',
                )
              }
            />
          </Card>
        ) : null}
      </ScrollView>
      <RelationshipPicker
        open={picker.open}
        current={picker.current}
        onClose={() => setPicker({ open: false, current: null })}
        person={person}
      />
      <ConnectSheet
        open={connect}
        onClose={() => setConnect(false)}
        person={person}
        onSent={refresh}
      />
    </Screen>
  );
}
