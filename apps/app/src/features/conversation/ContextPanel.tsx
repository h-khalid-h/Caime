import type { ConversationView, TaskView } from '@caishy/core/api';
import { formatDue } from '@caishy/core/format';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useMemory } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Calendar, CircleCheck, FileText, Link, Lock, Star, X } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

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

function TaskLine({ task, onToggle }: { task: TaskView; onToggle: (t: TaskView) => void }) {
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
          {task.direction === 'waiting' || task.direction === 'i_asked'
            ? `Waiting on ${task.assignee.displayName}`
            : task.direction === 'asked_me'
              ? `${task.owner.displayName} asked you`
              : 'Yours'}
          {task.dueAt ? ` · ${formatDue(task.dueAt, now, timeZone, locale)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** What this conversation knows (PRD §24): the relationship, open items, decisions, dates, files. */
export function ContextPanel({
  conversation,
  onClose,
}: {
  conversation: ConversationView;
  onClose?: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const memory = useMemory(conversation.id);
  const other = conversation.other;
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const toggle = async (task: TaskView) => {
    try {
      await endpoints.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' });
      void qc.invalidateQueries({ queryKey: qk.memory(conversation.id) });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const m = memory.data;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.surface }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 6,
          minHeight: 56,
          borderBottomWidth: 1,
          borderBottomColor: t.c.border,
        }}
      >
        <Text variant="label" style={{ flex: 1 }} accessibilityRole="header">
          About this conversation
        </Text>
        {onClose ? <IconButton icon={X} label="Close panel" onPress={onClose} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {other ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.navigate({ pathname: '/p/[id]', params: { id: other.userId } })}
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
                    Only you see this label
                  </Text>
                </View>
              </View>
            ) : (
              <Text variant="captionStrong" color="link">
                Add how you know them
              </Text>
            )}
          </Pressable>
        ) : (
          <Section title={`${conversation.participants.length} people`}>
            {conversation.participants.map((p) => (
              <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar
                  id={p.userId}
                  name={p.person.displayName}
                  url={p.person.avatarUrl}
                  size={32}
                />
                <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {p.person.displayName}
                </Text>
                {p.relationship ? (
                  <RelationshipChip label={p.relationship.label} sphere={p.relationship.sphere} />
                ) : null}
              </View>
            ))}
          </Section>
        )}
        {m ? (
          <>
            <Section title="Right now">
              <Text variant="body" color="textSecondary">
                {m.summary}
              </Text>
            </Section>
            {m.openItems.length ? (
              <Section title={`Open · ${m.openItems.length}`}>
                {m.openItems.map((task) => (
                  <TaskLine key={task.id} task={task} onToggle={toggle} />
                ))}
              </Section>
            ) : null}
            {m.decisions.length ? (
              <Section title="Decided">
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
              <Section title="Coming up">
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
            {m.documents.length || m.links.length ? (
              <Section title="Shared">
                {m.documents.map((d) => (
                  <View key={d.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <FileText size={14} color={t.c.textSecondary} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {d.title ?? 'Document'}
                    </Text>
                  </View>
                ))}
                {m.links.map((l) => (
                  <View key={l.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Link size={14} color={t.c.textSecondary} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }} color="link">
                      {l.host ?? l.url}
                    </Text>
                  </View>
                ))}
              </Section>
            ) : null}
            {!m.openItems.length && !m.decisions.length && !m.dates.length ? (
              <Section title="Memory">
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <CircleCheck size={16} color={t.c.textTertiary} />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    Promises, questions, dates and decisions from this conversation will gather
                    here, so nothing gets lost in the scroll.
                  </Text>
                </View>
              </Section>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
