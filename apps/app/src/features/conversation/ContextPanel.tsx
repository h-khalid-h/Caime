import type { ConversationView, TaskView } from '@caime/core/api';
import { formatDue, retentionText } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { mediaUrl } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useMemory } from '@/api/hooks';
import { qk } from '@/api/keys';
import { taskWho } from '@/features/actions/TaskRow';
import { AssistTools } from '@/features/assist/AssistTools';
import { useAiReady } from '@/features/assist/ready';
import { ComingUpList } from '@/features/common/comingUpLazy';
import { WhatsAppImport } from '@/features/import/WhatsAppImport';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { Choice } from '@/features/settings/SettingsPage';
import { openCheckedLink, openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { usePendingTasks, useTaskOutbox } from '@/state/taskOutbox';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import {
  Calendar,
  ChevronRight,
  CircleCheck,
  FileText,
  Hash,
  ImageIcon,
  LayoutGrid,
  Link,
  Lock,
  Star,
  X,
} from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { SharedFiles } from './SharedFiles';

// Who's in a group, and running it: loaded when a group's details are first shown.
const GroupPeople = lazyPart(() => import('./GroupPeople').then((m) => m.GroupPeople));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text variant="overline" color="textTertiary" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function TaskLine({
  task,
  onToggle,
  pending,
}: {
  task: TaskView;
  onToggle: (t: TaskView) => void;
  /** Changed on this device and not sent yet (PRD §49). */
  pending?: boolean;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const done = task.status === 'done';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={task.title}
      onPress={() => onToggle(task)}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: done ? t.c.success : t.c.borderStrong,
          backgroundColor: done ? t.c.success : 'transparent',
          marginTop: 1,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ textDecorationLine: done ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {taskWho(task) ?? tr('Yours')}
          {task.dueAt ? ` · ${formatDue(task.dueAt, now, timeZone, locale, task.dueHasTime)}` : ''}
          {pending ? tr(' · Pending') : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** Who's on the other side of a business conversation (R15): the organization, or the customer. */
function BusinessCard({
  conversation,
  go,
}: {
  conversation: ConversationView;
  go: (to: Parameters<typeof router.navigate>[0]) => void;
}) {
  const business = conversation.business;
  if (!business) return null;
  const { org, thread } = business;
  const customer = thread?.customer;
  if (!thread)
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tr('{name}, profile', { name: org.name })}
        onPress={() => go({ pathname: '/o/[handle]', params: { handle: org.handle } })}
        style={{ alignItems: 'center', gap: 8, padding: 20 }}
      >
        <OrgMark kind={org.kind} url={org.avatarUrl} size={72} />
        <Text variant="headline" align="center">
          {org.name}
        </Text>
        <VerifiedLine org={org} />
        <Text variant="caption" color="textSecondary" align="center">
          {tr('A business conversation. Its team answers as {name}.', { name: org.name })}
        </Text>
        <Text variant="captionStrong" color="link">
          {tr('See its profile')}
        </Text>
      </Pressable>
    );
  const team = conversation.participants.filter((p) => p.role === 'agent');
  return (
    <View style={{ alignItems: 'center', gap: 8, padding: 20 }}>
      {customer ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => go({ pathname: '/p/[id]', params: { id: customer.id } })}
          style={{ alignItems: 'center', gap: 8 }}
        >
          <Avatar id={customer.id} name={customer.displayName} url={customer.avatarUrl} size={72} />
          <Text variant="headline" align="center">
            {customer.displayName}
          </Text>
          <Text variant="caption" color="textSecondary">
            @{customer.handle} · {customer.trust.label}
          </Text>
        </Pressable>
      ) : (
        <Text variant="headline">{tr('Deleted account')}</Text>
      )}
      <Text variant="caption" color="textSecondary" align="center">
        {tr('A customer of {name}. They see {name}, not who on the team answers.', {
          name: org.name,
        })}
      </Text>
      <Text variant="caption" color="textTertiary" align="center">
        Team:{' '}
        {team
          .map((p) =>
            p.person.kind === 'human' ? p.person.displayName : `${p.person.displayName} (bot)`,
          )
          .join(', ')}
      </Text>
    </View>
  );
}

/** What this conversation knows (PRD §24): the relationship, open items, decisions, dates, files. */
export function ContextPanel({
  conversation,
  onClose,
  onJump,
}: {
  conversation: ConversationView;
  onClose?: () => void;
  /** Show a message in the conversation beside (or under) the panel. */
  onJump?: (seq: number) => void;
}) {
  const t = useTheme();
  const [sharing, setSharing] = useState(false);
  const memory = useMemory(conversation.id);
  const aiReady = useAiReady(conversation);
  const other = conversation.other;
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const { pending } = usePendingTasks();
  // Shown at once and sent when it can be, offline too (PRD §49).
  const toggle = (task: TaskView) =>
    useTaskOutbox.getState().setStatus(task, task.status === 'done' ? 'open' : 'done');
  const m = memory.data;
  // Going somewhere from here: on a phone the details are a sheet over the conversation, and
  // they step aside so what's opened isn't under them.
  const go = (to: Parameters<typeof router.navigate>[0]) => {
    onClose?.();
    router.navigate(to);
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.c.surface }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingStart: 16,
          paddingEnd: 6,
          minHeight: 56,
          borderBottomWidth: 1,
          borderBottomColor: t.c.border,
        }}
      >
        <Text variant="label" style={{ flex: 1 }} accessibilityRole="header">
          {tr('About this conversation')}
        </Text>
        {onClose ? <IconButton icon={X} label={tr('Close panel')} onPress={onClose} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {conversation.business ? (
          <BusinessCard conversation={conversation} go={go} />
        ) : other ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => go({ pathname: '/p/[id]', params: { id: other.userId } })}
            style={{ alignItems: 'center', gap: 8, padding: 20 }}
          >
            <Avatar
              id={other.userId}
              name={other.person.displayName}
              url={other.person.avatarUrl}
              size={72}
              presence={other.person.presence}
            />
            <Text variant="headline" align="center">
              {other.person.displayName}
            </Text>
            <Text variant="caption" color="textSecondary">
              @{other.person.handle} · {other.person.trust.label}
            </Text>
            {other.relationship ? (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <RelationshipChip
                  label={other.relationship.label}
                  sphere={other.relationship.sphere}
                  size="md"
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Lock size={11} color={t.c.textTertiary} />
                  <Text variant="caption" color="textTertiary">
                    {tr('Only you see this label')}
                  </Text>
                </View>
              </View>
            ) : (
              <Text variant="captionStrong" color="link">
                {tr('Add how you know them')}
              </Text>
            )}
          </Pressable>
        ) : conversation.kind === 'direct' ? (
          // The other person deleted their account: nobody to see, and nothing to leave.
          <View style={{ alignItems: 'center', gap: 8, padding: 20 }} testID="deleted-account">
            <Avatar id={conversation.id} name="Deleted account" size={72} />
            <Text variant="headline" align="center">
              {tr('Deleted account')}
            </Text>
            <Text variant="caption" color="textSecondary" align="center">
              {tr('What you wrote to each other stays here. Archive it to put it away.')}
            </Text>
          </View>
        ) : (
          <>
            {conversation.space ? (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  go({
                    pathname: '/s/[id]',
                    params: { id: conversation.space?.id ?? '' },
                  })
                }
                testID="open-space"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}
              >
                <LayoutGrid size={16} color={t.c.accentStrong} />
                <Text variant="captionStrong" color="link" style={{ flex: 1 }} numberOfLines={1}>
                  {tr('In {name} · open the space', { name: conversation.space.name })}
                </Text>
              </Pressable>
            ) : null}
            {conversation.purpose ? (
              <Text variant="body" color="textSecondary" style={{ paddingHorizontal: 16 }}>
                {conversation.purpose}
              </Text>
            ) : null}
            <GroupPeople conversation={conversation} onNavigate={onClose} />
          </>
        )}
        <Topics conversation={conversation} go={go} />
        {m ? (
          <>
            <Section title={tr('Right now')}>
              <Text variant="body" color="textSecondary">
                {m.summary}
              </Text>
              {aiReady ? <AssistTools conversationId={conversation.id} /> : null}
            </Section>
            {m.upcoming.length ? (
              <Section title={tr('Coming up')}>
                <ComingUpList
                  items={m.upcoming}
                  onOpen={(u) =>
                    onJump
                      ? onJump(u.seq)
                      : go({
                          pathname: '/c/[id]',
                          params: { id: conversation.id, seq: String(u.seq) },
                        })
                  }
                />
              </Section>
            ) : null}
            {m.openItems.length ? (
              <Section title={tr('Open · {length}', { length: m.openItems.length })}>
                {m.openItems.map((task) => (
                  <TaskLine
                    key={task.id}
                    task={task}
                    onToggle={toggle}
                    pending={pending.has(task.id)}
                  />
                ))}
              </Section>
            ) : null}
            {m.decisions.length ? (
              <Section title={tr('Decided')}>
                {m.decisions.map((d) => (
                  <View key={d.id} style={{ flexDirection: 'row', gap: 8 }}>
                    <Star size={14} color={t.c.warning} style={{ marginTop: 3 }} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {d.title}
                    </Text>
                  </View>
                ))}
              </Section>
            ) : null}
            {m.dates.length ? (
              <Section title={tr('Coming up')}>
                {m.dates.map((d) => (
                  <View
                    key={`${d.messageId}-${d.at}`}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                  >
                    <Calendar size={14} color={t.c.textSecondary} />
                    <Text variant="bodyStrong">{formatDue(d.at, now, timeZone, locale)}</Text>
                    <Text
                      variant="caption"
                      color="textTertiary"
                      style={{ flex: 1 }}
                      numberOfLines={1}
                    >
                      “{d.text}”
                    </Text>
                  </View>
                ))}
              </Section>
            ) : null}
            {m.counts.files || m.links.length ? (
              <Section title={tr('Shared')}>
                {m.documents.slice(0, 3).map((d) => (
                  <Pressable
                    key={d.id}
                    accessibilityRole="link"
                    accessibilityLabel={d.title ?? tr('Document')}
                    disabled={!d.url}
                    onPress={() => {
                      const url = mediaUrl(d.url);
                      if (url) openLink(url);
                    }}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                  >
                    <FileText size={14} color={t.c.textSecondary} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {d.title ?? tr('Document')}
                    </Text>
                  </Pressable>
                ))}
                {m.links.slice(0, 3).map((l) => (
                  <Pressable
                    key={l.id}
                    accessibilityRole="link"
                    accessibilityLabel={l.host ?? l.url ?? tr('Link')}
                    disabled={!l.url}
                    onPress={() => {
                      if (l.url) void openCheckedLink(l.url);
                    }}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                  >
                    <Link size={14} color={t.c.textSecondary} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }} color="link">
                      {l.host ?? l.url}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSharing(true)}
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}
                  testID="open-shared"
                >
                  <ImageIcon size={14} color={t.c.accentStrong} />
                  <Text variant="captionStrong" color="link" style={{ flex: 1 }}>
                    {tr('Photos, files and links')}
                  </Text>
                  <ChevronRight size={16} color={t.c.textTertiary} />
                </Pressable>
              </Section>
            ) : null}
            {!m.openItems.length && !m.decisions.length && !m.dates.length ? (
              <Section title={tr('Memory')}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <CircleCheck size={16} color={t.c.textTertiary} />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {tr(
                      'Promises, questions, dates and decisions from this conversation will gather here, so nothing gets lost in the scroll.',
                    )}
                  </Text>
                </View>
              </Section>
            ) : null}
          </>
        ) : null}
        <Disappearing conversation={conversation} />
      </ScrollView>
      {sharing ? (
        <SharedFiles
          conversation={conversation}
          onClose={() => setSharing(false)}
          onJump={onJump}
        />
      ) : null}
    </View>
  );
}

/** The server's limit on a topic's name. */
const TOPIC_MAX = 80;

/**
 * Where a subject can have a conversation of its own (PRD §58): a one-to-one with someone you're
 * connected with, or a group that isn't in a space (a space has its own conversations).
 */
function topicsFor(c: ConversationView): 'direct' | 'group' | null {
  // Only between people connected now (a view from before says nothing, so offers nothing).
  if (
    c.kind === 'direct' &&
    c.isGeneral &&
    c.other &&
    !c.request &&
    c.privacyClass !== 'private' &&
    c.connected === true
  )
    return 'direct';
  if (c.kind === 'group' && !c.space && !c.parentId) return 'group';
  return null;
}

/** A conversation's topics, and starting one: in a group, everyone in it is in it. */
function Topics({
  conversation,
  go,
}: {
  conversation: ConversationView;
  go: (to: Parameters<typeof router.navigate>[0]) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const where = topicsFor(conversation);
  if (!where) return null;
  const other = conversation.other;
  // A view kept from before topics were listed has none.
  const topics = conversation.topics ?? [];
  const start = async () => {
    setBusy(true);
    try {
      const { conversationId } = await endpoints.startTopic(conversation.id, name.trim());
      setStarting(false);
      setName('');
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      void qc.invalidateQueries({ queryKey: qk.inbox });
      go({ pathname: '/c/[id]', params: { id: conversationId } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title={topics.length ? tr('Topics · {length}', { length: topics.length }) : tr('Topics')}
    >
      {topics.map((topic) => (
        <Pressable
          key={topic.id}
          accessibilityRole="link"
          accessibilityLabel={tr('{title}, topic', { title: topic.title })}
          onPress={() => go({ pathname: '/c/[id]', params: { id: topic.id } })}
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
          testID="topic-row"
        >
          <Hash size={14} color={t.c.textSecondary} />
          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {topic.title}
          </Text>
          <ChevronRight size={16} color={t.c.textTertiary} />
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setStarting(true)}
        style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}
        testID="topic-start"
      >
        <Hash size={14} color={t.c.accentStrong} />
        <Text variant="captionStrong" color="link">
          {tr('Start a topic')}
        </Text>
      </Pressable>
      {where === 'direct' && other ? (
        // A chat from before Caime (R45), brought over from WhatsApp as a topic with this person;
        // the file is read on this device. Its sheet stays in this route's chunk: split out, what
        // they share (the picker, Choice) would move into __common, which loads first.
        <Pressable
          accessibilityRole="button"
          onPress={() => setImporting(true)}
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 }}
          testID="import-whatsapp"
        >
          <FileText size={14} color={t.c.accentStrong} />
          <Text variant="captionStrong" color="link">
            {tr('Bring over a WhatsApp chat')}
          </Text>
        </Pressable>
      ) : null}
      {importing && other ? (
        <WhatsAppImport
          other={{ userId: other.userId, name: other.person.displayName }}
          onClose={() => setImporting(false)}
          onDone={(id) => {
            setImporting(false);
            go({ pathname: '/c/[id]', params: { id } });
          }}
        />
      ) : null}
      <Sheet
        open={starting}
        onClose={() => setStarting(false)}
        title={tr('Start a topic')}
        subtitle={
          where === 'group'
            ? tr('A conversation of its own, with everyone in {title}.', {
                title: conversation.title,
              })
            : tr('A conversation of its own with {title}, on one subject.', {
                title: conversation.title,
              })
        }
        footer={
          <Button
            label={tr('Start')}
            block
            size="lg"
            disabled={!name.trim()}
            loading={busy}
            onPress={() => void start()}
            testID="topic-save"
          />
        }
      >
        <TextField
          label={tr('What it’s about')}
          value={name}
          onChangeText={setName}
          maxLength={TOPIC_MAX}
          autoFocus
          onSubmitEditing={() => {
            if (name.trim() && !busy) void start();
          }}
          testID="topic-name"
        />
      </Sheet>
    </Section>
  );
}

const KEEP = ['off', '1', '7', '30', '90', '365'] as const;

/** Messages here can disappear after a while; everyone in the conversation is told (R25). */
function Disappearing({ conversation }: { conversation: ConversationView }) {
  const qc = useQueryClient();
  const days = conversation.retentionDays;
  // A group's topic goes as its group does: that's where it's changed (PRD §58).
  const ofGroup =
    conversation.kind === 'group' && conversation.parentId ? conversation.title : null;
  const canChange =
    !ofGroup &&
    (conversation.kind === 'direct' || ['owner', 'admin'].includes(conversation.me.role));
  const current = (days === null ? 'off' : String(days)) as (typeof KEEP)[number];
  const set = async (value: (typeof KEEP)[number]) => {
    try {
      await endpoints.updateConversation(conversation.id, {
        retentionDays: value === 'off' ? null : Number(value),
      });
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      // Only what's sent from now on: what came before keeps the time it was sent with.
      toast(
        value === 'off'
          ? tr('New messages stay')
          : tr('New messages disappear after {retentionText}', {
              retentionText: retentionText(Number(value)),
            }),
      );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const [choosing, setChoosing] = useState(false);
  return (
    <Section title={tr('Disappearing messages')}>
      {canChange ? (
        // One row, like every other setting here; the choice opens over it.
        <>
          <ListRow
            title={
              days === null
                ? tr('Off')
                : tr('After {retentionText}', { retentionText: retentionText(days) })
            }
            subtitle={tr('New messages only; what came before keeps its time')}
            chevron
            onPress={() => setChoosing(true)}
            style={{ marginHorizontal: -16 }}
            testID="disappearing-row"
          />
          <Sheet
            open={choosing}
            onClose={() => setChoosing(false)}
            title={tr('Disappearing messages')}
          >
            <Choice
              label={tr('Disappearing messages')}
              value={KEEP.includes(current) ? current : 'off'}
              onChange={(v) => {
                setChoosing(false);
                void set(v);
              }}
              options={KEEP.map((v) =>
                v === 'off'
                  ? {
                      value: v,
                      label: tr('Off'),
                      detail: tr('New messages stay until someone deletes them'),
                    }
                  : { value: v, label: retentionText(Number(v)) },
              )}
            />
          </Sheet>
        </>
      ) : (
        <Text variant="body" color="textSecondary" testID="disappearing-shown">
          {[
            ofGroup ? tr('As {ofGroup}', { ofGroup }) : null,
            days === null ? 'Off' : `after ${retentionText(days)}`,
          ]
            .filter(Boolean)
            .join(': ')
            .replace(/^after/, 'After')}
        </Text>
      )}
    </Section>
  );
}
