import type { BusinessThreadView, ConversationView } from '@caishy/core/api';
import { waitedFor } from '@caishy/core/business';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Check, Ellipsis, TriangleAlert, UserRound } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { StateChip } from './states';

/**
 * For the team, above a customer's conversation (PRD §38): what state it's in, how long the
 * customer has waited, who has it, and the moves: take it, hand it on, escalate, resolve.
 */
export function ThreadBar({
  conversation,
  thread,
}: {
  conversation: ConversationView;
  thread: BusinessThreadView;
}) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const now = useNow();
  const [menu, setMenu] = useState<'more' | 'assign' | 'escalate' | null>(null);
  const shownMenu = useRef(menu);
  if (menu) shownMenu.current = menu;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const team = conversation.participants.filter((p) => p.role === 'agent');
  const mine = thread.assignee?.userId === me.id;
  const resolved = thread.state === 'resolved';

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
      setMenu(null);
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      void qc.invalidateQueries({ queryKey: ['org-inbox'] });
      void qc.invalidateQueries({ queryKey: qk.businessSummary });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const who = thread.assignee
    ? mine
      ? 'You have it'
      : `${thread.assignee.displayName} has it`
    : 'Nobody has it yet';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.c.border,
        backgroundColor: t.c.surface,
      }}
      testID="thread-bar"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StateChip state={thread.state} testID="thread-state" />
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {[
            thread.waitingSince
              ? waitedFor(thread.waitingSince, now) === 'just now'
                ? 'Wrote just now'
                : `Waiting ${waitedFor(thread.waitingSince, now)}`
              : null,
            who,
            conversation.business?.org.name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {thread.escalated ? (
        <Text variant="caption" color="danger" numberOfLines={2}>
          {thread.escalated.byName ?? 'Someone'} escalated it
          {thread.escalated.note ? `: “${thread.escalated.note}”` : ''}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {resolved ? (
          <Button
            label="Reopen"
            size="sm"
            variant="secondary"
            loading={busy}
            onPress={() => void act(() => endpoints.reopenThread(conversation.id), 'Reopened')}
            testID="thread-reopen"
          />
        ) : (
          <>
            {!mine ? (
              <Button
                label="Take it"
                size="sm"
                icon={UserRound}
                loading={busy}
                onPress={() =>
                  void act(() => endpoints.assignThread(conversation.id, me.id), 'It’s yours')
                }
                testID="thread-take"
              />
            ) : null}
            <Button
              label="Resolve"
              size="sm"
              icon={Check}
              variant={mine ? 'primary' : 'secondary'}
              loading={busy}
              onPress={() => void act(() => endpoints.resolveThread(conversation.id), 'Resolved')}
              testID="thread-resolve"
            />
          </>
        )}
        <Button
          label="More"
          size="sm"
          icon={Ellipsis}
          variant="ghost"
          onPress={() => setMenu('more')}
          testID="thread-more"
        />
      </View>

      <Sheet
        open={menu !== null}
        onClose={() => {
          setMenu(null);
          setNote('');
        }}
        title={
          shownMenu.current === 'assign'
            ? 'Who has it'
            : shownMenu.current === 'escalate'
              ? 'Escalate to the owner and admins'
              : 'This conversation'
        }
        subtitle={
          shownMenu.current === 'escalate'
            ? 'They’re told at once. Say what needs them, if it helps.'
            : undefined
        }
        footer={
          shownMenu.current === 'escalate' ? (
            <Button
              label="Escalate"
              variant="danger"
              block
              size="lg"
              loading={busy}
              onPress={() =>
                void act(
                  () => endpoints.escalateThread(conversation.id, note.trim() || undefined),
                  'Escalated',
                )
              }
              testID="thread-escalate-confirm"
            />
          ) : undefined
        }
      >
        {shownMenu.current === 'more' ? (
          <View style={{ marginHorizontal: -20 }}>
            <ListRow
              icon={UserRound}
              title="Give it to someone"
              subtitle={who}
              onPress={() => setMenu('assign')}
              testID="thread-assign"
            />
            {thread.escalated ? (
              <ListRow
                icon={TriangleAlert}
                title="It’s handled: stop escalating"
                onPress={() =>
                  void act(() => endpoints.deescalateThread(conversation.id), 'No longer escalated')
                }
              />
            ) : resolved ? null : (
              <ListRow
                icon={TriangleAlert}
                title="Escalate"
                subtitle="It needs the owner or an admin"
                onPress={() => setMenu('escalate')}
                testID="thread-escalate"
              />
            )}
          </View>
        ) : shownMenu.current === 'assign' ? (
          <View style={{ marginHorizontal: -20 }}>
            {team.map((p) => (
              <ListRow
                key={p.userId}
                left={
                  <Avatar
                    id={p.userId}
                    name={p.person.displayName}
                    url={p.person.avatarUrl}
                    size={32}
                  />
                }
                title={p.userId === me.id ? `${p.person.displayName} (you)` : p.person.displayName}
                checked={thread.assignee?.userId === p.userId}
                onPress={() =>
                  void act(
                    () => endpoints.assignThread(conversation.id, p.userId),
                    p.userId === me.id ? 'It’s yours' : `${p.person.displayName} has it`,
                  )
                }
                testID={`thread-assign-${p.person.handle}`}
              />
            ))}
            {thread.assignee ? (
              <ListRow
                title="Nobody"
                subtitle="Back to New for the whole team"
                onPress={() =>
                  void act(() => endpoints.assignThread(conversation.id, null), 'Nobody has it')
                }
              />
            ) : null}
          </View>
        ) : (
          <TextField
            label="What needs them (optional)"
            value={note}
            onChangeText={setNote}
            maxLength={300}
            multiline
            testID="thread-escalate-note"
          />
        )}
      </Sheet>
    </View>
  );
}
