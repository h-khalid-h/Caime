import type { BusinessThreadView, ConversationView } from '@caime/core/api';
import { waitedFor, waitedMinutes } from '@caime/core/business';
import { tr } from '@caime/core/i18n';
import { canManageOrg } from '@caime/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import Check from 'lucide-react-native/icons/check';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Trash from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import UserRound from 'lucide-react-native/icons/user-round';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useOrg } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useNow } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
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
  const [menu, setMenu] = useState<'more' | 'assign' | 'escalate' | 'erase' | null>(null);
  const shownMenu = useRef(menu);
  if (menu) shownMenu.current = menu;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // People take conversations; an app's bot answers without taking one (R16).
  const team = conversation.participants.filter(
    (p) => p.role === 'agent' && p.person.kind === 'human',
  );
  const mine = thread.assignee?.userId === me.id;
  const resolved = thread.state === 'resolved';
  // Erasing is the owner's and admins' (R54): shown only to them, so nobody meets a refusal.
  const org = useOrg(conversation.business?.org.handle ?? '').data?.org;
  const manager = canManageOrg(org?.myRole);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
      setMenu(null);
      void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
      void qc.invalidateQueries({ queryKey: qk.allOrgInboxes });
      void qc.invalidateQueries({ queryKey: qk.businessSummary });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const who = thread.assignee
    ? mine
      ? tr('You have it')
      : tr('{displayName} has it', { displayName: thread.assignee.displayName })
    : tr('Nobody has it yet');

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
        <StateChip
          state={thread.state}
          closed={thread.closed}
          request={thread.awaitingAcceptance}
          testID="thread-state"
        />
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {[
            thread.waitingSince
              ? waitedMinutes(thread.waitingSince, now) < 1
                ? tr('Wrote just now')
                : tr('Waiting {waitedFor}', { waitedFor: waitedFor(thread.waitingSince, now) })
              : null,
            who,
            thread.customerUnder18 ? tr('Under 18') : null,
            thread.erasedAt ? tr('Erased at the customer’s request') : null,
            conversation.business?.org.name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {thread.escalated ? (
        <Text variant="caption" color="danger" numberOfLines={2}>
          {tr('{name} escalated it', { name: thread.escalated.byName ?? tr('Someone') })}
          {thread.escalated.note ? `: “${thread.escalated.note}”` : ''}
        </Text>
      ) : null}
      {/* Closed by the customer: there's nothing left for the team to do in it. */}
      {thread.closed ? null : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {resolved ? (
            <Button
              label={tr('Reopen')}
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
                  label={tr('Take it')}
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
                label={tr('Resolve')}
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
            label={tr('More')}
            size="sm"
            icon={Ellipsis}
            variant="ghost"
            onPress={() => setMenu('more')}
            testID="thread-more"
          />
        </View>
      )}

      <Sheet
        open={menu !== null}
        onClose={() => {
          setMenu(null);
          setNote('');
        }}
        title={
          shownMenu.current === 'assign'
            ? tr('Who has it')
            : shownMenu.current === 'escalate'
              ? tr('Escalate to the owner and admins')
              : shownMenu.current === 'erase'
                ? tr('Erase at the customer’s request')
                : tr('This conversation')
        }
        subtitle={
          shownMenu.current === 'escalate'
            ? tr('They’re told at once. Say what needs them, if it helps.')
            : shownMenu.current === 'erase'
              ? tr(
                  'Every message in this conversation goes, for the customer and the team, and a line says {name} erased it at their request. Caime keeps that you did it. It can’t be undone.',
                  { name: conversation.business?.org.name ?? tr('the organization') },
                )
              : undefined
        }
        footer={
          shownMenu.current === 'escalate' ? (
            <Button
              label={tr('Escalate')}
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
          ) : shownMenu.current === 'erase' ? (
            <Button
              label={tr('Erase every message')}
              variant="danger"
              block
              size="lg"
              loading={busy}
              onPress={() =>
                void act(
                  () => endpoints.eraseThread(conversation.business?.org.id ?? '', conversation.id),
                  'Erased',
                )
              }
              testID="thread-erase-confirm"
            />
          ) : undefined
        }
      >
        {shownMenu.current === 'more' ? (
          <View style={{ marginHorizontal: -20 }}>
            <ListRow
              icon={UserRound}
              title={tr('Give it to someone')}
              subtitle={who}
              onPress={() => setMenu('assign')}
              testID="thread-assign"
            />
            {thread.escalated ? (
              <ListRow
                icon={TriangleAlert}
                title={tr('It’s handled: stop escalating')}
                onPress={() =>
                  void act(() => endpoints.deescalateThread(conversation.id), 'No longer escalated')
                }
              />
            ) : resolved ? null : (
              <ListRow
                icon={TriangleAlert}
                title={tr('Escalate')}
                subtitle={tr('It needs the owner or an admin')}
                onPress={() => setMenu('escalate')}
                testID="thread-escalate"
              />
            )}
            {manager && !thread.erasedAt ? (
              <ListRow
                icon={Trash}
                title={tr('Erase at the customer’s request')}
                subtitle={tr('Every message in it goes; the customer is told')}
                destructive
                onPress={() => setMenu('erase')}
                testID="thread-erase"
              />
            ) : null}
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
                title={
                  p.userId === me.id
                    ? tr('{displayName} (you)', { displayName: p.person.displayName })
                    : p.person.displayName
                }
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
                title={tr('Nobody')}
                subtitle={tr('Back to New for the whole team')}
                onPress={() =>
                  void act(() => endpoints.assignThread(conversation.id, null), 'Nobody has it')
                }
              />
            ) : null}
          </View>
        ) : (
          <TextField
            label={tr('What needs them (optional)')}
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
