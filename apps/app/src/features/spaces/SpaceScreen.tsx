import type { SpaceConversationView, SpaceMemberView, SpaceView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { handsOverOnLeaving } from '@caime/core/permissions';
import {
  canChangeSpaceRole,
  canManageSpace,
  canRemoveFromSpace,
  SPACE_KIND_DEFS,
  SPACE_KINDS,
  SPACE_ROLE_LABELS,
  type SpaceKind,
} from '@caime/core/spaces';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Hash from 'lucide-react-native/icons/hash';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import LogOut from 'lucide-react-native/icons/log-out';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Plus from 'lucide-react-native/icons/plus';
import Settings from 'lucide-react-native/icons/settings';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSpace } from '@/api/hooks';
import { qk } from '@/api/keys';
import { ComingUpList } from '@/features/common/comingUpLazy';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Chip, RelationshipChip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { SPACE_ICONS } from './kinds';

function useRefresh(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.space(id) });
    void qc.invalidateQueries({ queryKey: qk.spaces });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  };
}

function ConversationRow({ space, c }: { space: SpaceView; c: SpaceConversationView }) {
  const refresh = useRefresh(space.id);
  const [joining, setJoining] = useState(false);
  const open = () => router.navigate({ pathname: '/c/[id]', params: { id: c.id } });
  const join = async () => {
    setJoining(true);
    try {
      await endpoints.joinSpaceConversation(space.id, c.id);
      refresh();
      open();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setJoining(false);
    }
  };
  const subtitle = c.lastMessage
    ? `${c.lastMessage.mine ? 'You' : (c.lastMessage.senderName ?? '')}${c.lastMessage.senderName || c.lastMessage.mine ? ': ' : ''}${c.lastMessage.preview}`
    : (c.purpose ?? trn(c.memberCount, '{n} person', '{n} people'));
  return (
    <ListRow
      icon={c.isGeneral ? MessageCircle : Hash}
      title={c.title}
      subtitle={subtitle}
      testID={`space-conversation-${c.title}`}
      onPress={c.joined ? open : () => void join()}
      right={
        c.joined ? (
          <Badge count={c.unreadCount} />
        ) : (
          <Button
            label={tr('Join')}
            size="sm"
            variant="secondary"
            loading={joining}
            onPress={() => void join()}
          />
        )
      }
    />
  );
}

function MemberRow({
  space,
  m,
  onManage,
}: {
  space: SpaceView;
  m: SpaceMemberView;
  onManage: (m: SpaceMemberView) => void;
}) {
  const me = useSession((s) => s.user?.id);
  const self = m.userId === me;
  const manageable =
    !self && (canRemoveFromSpace(space.myRole, m.role) || canChangeSpaceRole(space.myRole, m.role));
  return (
    <ListRow
      left={<Avatar id={m.userId} name={m.person.displayName} url={m.person.avatarUrl} size={36} />}
      title={
        self
          ? tr('{displayName} (you)', { displayName: m.person.displayName })
          : m.person.displayName
      }
      subtitle={m.role === 'member' ? null : SPACE_ROLE_LABELS[m.role]}
      onPress={
        manageable
          ? () => onManage(m)
          : self
            ? undefined
            : () => router.navigate({ pathname: '/p/[id]', params: { id: m.userId } })
      }
      right={
        m.relationship ? (
          <RelationshipChip label={m.relationship.label} sphere={m.relationship.sphere} />
        ) : null
      }
    />
  );
}

/** A space (PRD §40): its conversations, its people, and what it's for. */
export function SpaceScreen({ id }: { id: string }) {
  const t = useTheme();
  const { desktop } = useLayout();
  const q = useSpace(id);
  const refresh = useRefresh(id);
  const space = q.data?.space;
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newConvo, setNewConvo] = useState(false);
  const [title, setTitle] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [managing, setManaging] = useState<SpaceMemberView | null>(null);
  // The sheet keeps showing who it was about while it closes, instead of fading out empty.
  const lastManaged = useRef<SpaceMemberView | null>(null);
  if (managing) lastManaged.current = managing;
  const shown = managing ?? lastManaged.current;
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState<{ name: string; purpose: string; kind: SpaceKind } | null>(
    null,
  );
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = useSession((s) => s.user?.id ?? '');

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast(done);
      refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <IconButton
      icon={ArrowLeft}
      label={tr('Back')}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/spaces'))}
    />
  );

  if (!space)
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar left={desktop ? undefined : back} title={tr('Space')} />
        {q.isError ? (
          <EmptyState
            character="pico"
            icon={LayoutGrid}
            title={tr('This space isn’t here')}
            body={tr('It may have closed, or you’re no longer in it.')}
            action={<Button label={tr('Your spaces')} onPress={() => router.replace('/spaces')} />}
          />
        ) : (
          <SkeletonRows />
        )}
      </Screen>
    );

  const Icon = SPACE_ICONS[space.kind];
  const manager = canManageSpace(space.myRole);
  const inSpace = new Set(space.members.map((m) => m.userId));

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={desktop ? undefined : back}
        title={space.name}
        right={
          <IconButton
            icon={Settings}
            label={tr('Space settings')}
            onPress={() => {
              setDraft({ name: space.name, purpose: space.purpose ?? '', kind: space.kind });
              setSettings(true);
            }}
            testID="space-settings"
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 32,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 8,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              backgroundColor: t.c.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={34} color={t.c.accentStrong} />
          </View>
          <Text variant="title" align="center" auto>
            {space.name}
          </Text>
          {space.purpose ? (
            <Text variant="body" color="textSecondary" align="center" auto>
              {space.purpose}
            </Text>
          ) : null}
          <Spec
            style={{ alignSelf: 'stretch', marginTop: 6 }}
            testID="space-spec"
            rows={[
              { label: 'kind', value: tr(SPACE_KIND_DEFS[space.kind].label) },
              {
                label: 'people',
                value: trn(space.memberCount, '{n} person', '{n} people'),
              },
              space.org
                ? {
                    label: 'organization',
                    value: (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                          router.navigate({
                            pathname: '/o/[handle]',
                            params: { handle: space.org?.handle },
                          })
                        }
                        testID="space-org"
                      >
                        <Text variant="bodyStrong" color="link">
                          {space.org.name}
                        </Text>
                      </Pressable>
                    ),
                  }
                : null,
            ]}
          />
        </View>

        {space.upcoming.length ? (
          <>
            <SectionTitle>{tr('Coming up')}</SectionTitle>
            <View
              style={{
                marginHorizontal: 16,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: t.c.border,
                backgroundColor: t.c.surface,
              }}
            >
              <ComingUpList
                items={space.upcoming}
                showWhere
                onOpen={(u) =>
                  router.navigate({
                    pathname: '/c/[id]',
                    params: { id: u.conversationId, seq: String(u.seq) },
                  })
                }
              />
            </View>
          </>
        ) : null}

        <SectionTitle
          action={
            <Button
              label={tr('New')}
              icon={Plus}
              size="sm"
              variant="ghost"
              onPress={() => setNewConvo(true)}
              testID="space-new-conversation"
            />
          }
        >
          {tr('Conversations')}
        </SectionTitle>
        <View
          style={{
            marginHorizontal: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.c.border,
            backgroundColor: t.c.surface,
            overflow: 'hidden',
          }}
        >
          {space.conversations.map((c) => (
            <ConversationRow key={c.id} space={space} c={c} />
          ))}
        </View>

        <SectionTitle
          action={
            manager ? (
              <Button
                label={tr('Add')}
                icon={UserPlus}
                size="sm"
                variant="ghost"
                onPress={() => setAdding(true)}
                testID="space-add-people"
              />
            ) : undefined
          }
        >
          {tr('People · {memberCount}', { memberCount: space.memberCount })}
        </SectionTitle>
        <View
          style={{
            marginHorizontal: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.c.border,
            backgroundColor: t.c.surface,
            overflow: 'hidden',
          }}
        >
          {space.members.map((m) => (
            <MemberRow key={m.userId} space={space} m={m} onManage={setManaging} />
          ))}
        </View>
        <Text
          variant="caption"
          color="textTertiary"
          style={{ paddingHorizontal: 22, paddingTop: 8 }}
        >
          {tr('How you know each person is your label: only you see it.')}
        </Text>
      </ScrollView>

      <Sheet
        open={newConvo}
        onClose={() => setNewConvo(false)}
        title={tr('New conversation')}
        subtitle={tr('In {name}. Anyone in the space can find it and join.', { name: space.name })}
        footer={
          <Button
            label={tr('Start it')}
            block
            size="lg"
            loading={busy}
            testID="space-conversation-create"
            onPress={() =>
              void (async () => {
                if (!title.trim()) return toast(tr('Name the conversation.'));
                setBusy(true);
                try {
                  const { conversation } = await endpoints.createSpaceConversation(space.id, {
                    title: title.trim(),
                    everyone,
                  });
                  setNewConvo(false);
                  setTitle('');
                  refresh();
                  router.navigate({ pathname: '/c/[id]', params: { id: conversation.id } });
                } catch (e) {
                  toast((e as Error).message, { tone: 'danger' });
                } finally {
                  setBusy(false);
                }
              })()
            }
          />
        }
      >
        <TextField
          label={tr('What it’s about')}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={tr('Venue, Budget, Weekend plans…')}
          autoFocus
          testID="space-conversation-title"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip
            label={tr('Everyone in the space')}
            selected={everyone}
            onPress={() => setEveryone(true)}
          />
          <Chip
            label={tr('Just me, until others join')}
            selected={!everyone}
            onPress={() => setEveryone(false)}
          />
        </View>
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setPicked(new Set());
        }}
        title={tr('Add people')}
        subtitle={tr('People you’re connected with. They join General straight away.')}
        footer={
          <Button
            label={picked.size ? tr('Add {size}', { size: picked.size }) : tr('Add')}
            block
            size="lg"
            disabled={picked.size === 0}
            loading={busy}
            testID="space-add-confirm"
            onPress={() =>
              void (async () => {
                const n = picked.size;
                if (
                  await run(
                    () => endpoints.addToSpace(space.id, [...picked]),
                    tr('Added {n} {person}', { n, person: n === 1 ? 'person' : 'people' }),
                  )
                ) {
                  setAdding(false);
                  setPicked(new Set());
                }
              })()
            }
          />
        }
      >
        <View style={{ marginHorizontal: -4 }}>
          <PeoplePicker
            picked={picked}
            exclude={inSpace}
            onToggle={(uid) => setPicked((p) => toggled(p, uid))}
          />
        </View>
      </Sheet>

      <Sheet
        open={managing !== null}
        onClose={() => setManaging(null)}
        title={shown?.person.displayName}
        subtitle={shown ? SPACE_ROLE_LABELS[shown.role] : undefined}
      >
        {shown ? (
          <View style={{ marginHorizontal: -20 }}>
            <ListRow
              icon={MessageCircle}
              title={tr('See their profile')}
              onPress={() => {
                const who = shown.userId;
                setManaging(null);
                router.navigate({ pathname: '/p/[id]', params: { id: who } });
              }}
            />
            {canChangeSpaceRole(space.myRole, shown.role) ? (
              <ListRow
                icon={Settings}
                title={shown.role === 'admin' ? tr('Make a member') : tr('Make an admin')}
                subtitle={
                  shown.role === 'admin'
                    ? tr('They stop adding and removing people')
                    : tr('Admins add people and remove members')
                }
                testID="space-toggle-admin"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    await run(
                      () =>
                        endpoints.setSpaceRole(
                          space.id,
                          who.userId,
                          who.role === 'admin' ? 'member' : 'admin',
                        ),
                      who.role === 'admin'
                        ? `${who.person.displayName} is a member`
                        : `${who.person.displayName} is an admin`,
                    );
                  })()
                }
              />
            ) : null}
            {canRemoveFromSpace(space.myRole, shown.role) ? (
              <ListRow
                icon={LogOut}
                title={tr('Remove from the space')}
                subtitle={tr('They leave its conversations too')}
                destructive
                testID="space-remove"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    await run(
                      () => endpoints.removeFromSpace(space.id, who.userId),
                      `${who.person.displayName} is no longer in the space`,
                    );
                  })()
                }
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        open={settings}
        onClose={() => setSettings(false)}
        title={tr('Space settings')}
        footer={
          manager && draft ? (
            <Button
              label={tr('Save')}
              block
              size="lg"
              loading={busy}
              testID="space-settings-save"
              onPress={() =>
                void (async () => {
                  if (!draft.name.trim()) return toast(tr('Give the space a name.'));
                  if (
                    await run(
                      () =>
                        endpoints.updateSpace(space.id, {
                          name: draft.name.trim(),
                          kind: draft.kind,
                          purpose: draft.purpose.trim() || null,
                        }),
                      'Saved',
                    )
                  )
                    setSettings(false);
                })()
              }
            />
          ) : undefined
        }
      >
        {manager && draft ? (
          <>
            <TextField
              label={tr('Name')}
              value={draft.name}
              onChangeText={(v) => setDraft({ ...draft, name: v })}
              maxLength={80}
              testID="space-settings-name"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SPACE_KINDS.map((k) => (
                <Chip
                  key={k}
                  label={tr(SPACE_KIND_DEFS[k].label)}
                  icon={SPACE_ICONS[k]}
                  selected={draft.kind === k}
                  onPress={() => setDraft({ ...draft, kind: k })}
                />
              ))}
            </View>
            <TextField
              label={tr('What it’s for (optional)')}
              value={draft.purpose}
              onChangeText={(v) => setDraft({ ...draft, purpose: v })}
              maxLength={280}
            />
          </>
        ) : (
          <Text variant="body" color="textSecondary">
            {tr('The space’s owner and admins change its name and what it’s for.')}
          </Text>
        )}
        <View style={{ marginHorizontal: -20, marginTop: 8 }}>
          <ListRow
            icon={LogOut}
            title={tr('Leave the space')}
            subtitle={tr('You leave its conversations too')}
            destructive
            testID="space-leave"
            onPress={() => {
              setSettings(false);
              setLeaving(true);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={tr('Leave {name}?', { name: space.name })}
        subtitle={
          handsOverOnLeaving(space.myRole)
            ? space.memberCount > 1
              ? tr(
                  'The admin who has been here longest takes over, or else the longest-standing member.',
                )
              : tr('You’re the last one here, so the space closes.')
            : tr('You leave its conversations too. Someone in it can add you back.')
        }
        footer={
          <Button
            label={tr('Leave')}
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="space-leave-confirm"
            onPress={() =>
              void (async () => {
                if (
                  await run(() => endpoints.removeFromSpace(space.id, me), 'You left the space')
                ) {
                  setLeaving(false);
                  router.replace('/spaces');
                }
              })()
            }
          />
        }
      >
        <View />
      </Sheet>
    </Screen>
  );
}
