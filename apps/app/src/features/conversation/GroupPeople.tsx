/**
 * A group's people, and running it (PRD §56): who's in it and who runs it, adding and removing
 * people, making admins, its name and what it's for, and leaving. The rules are the server's
 * (the owner makes admins; admins add people and remove members; anyone may leave, and an owner
 * who leaves hands it on); this only offers what they allow. Loaded with the details panel.
 */
import type { ConversationView, ParticipantView } from '@caishy/core/api';
import {
  canChangeSpaceRole,
  canManageSpace,
  canRemoveFromSpace,
  SPACE_ROLE_LABELS,
  type SpaceRole,
} from '@caishy/core/spaces';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { leftConversation } from '@/realtime/apply';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { LogOut, MessageCircle, Pencil, Settings, UserMinus } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const roleOf = (role: string): SpaceRole =>
  role === 'owner' || role === 'admin' ? role : 'member';

export function GroupPeople({ conversation }: { conversation: ConversationView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id ?? '');
  const myRole = roleOf(conversation.me.role);
  const manager = canManageSpace(myRole);
  // A space's General holds the space's people: they're added and removed there.
  const general = Boolean(conversation.space) && conversation.isGeneral;
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState<ParticipantView | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState<{ title: string; purpose: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const people = conversation.participants;
  const inIt = new Set(people.map((p) => p.userId));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.conversation(conversation.id) });
    void qc.invalidateQueries({ queryKey: qk.inbox });
  };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
      refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const shown = managing ? people.find((p) => p.userId === managing.userId) : undefined;
  const theirRole = shown ? roleOf(shown.role) : 'member';

  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }} testID="group-people">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          variant="overline"
          color="textTertiary"
          accessibilityRole="header"
          style={{ flex: 1 }}
        >
          {`${people.length} people`}
        </Text>
        {manager && !general ? (
          <Button
            label="Add"
            size="sm"
            variant="secondary"
            onPress={() => setAdding(true)}
            testID="group-add"
          />
        ) : null}
      </View>
      {manager && !general ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change the group’s name and what it’s for"
          onPress={() =>
            setEditing({ title: conversation.title, purpose: conversation.purpose ?? '' })
          }
          testID="group-edit"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}
        >
          <Pencil size={14} color={t.c.accentStrong} />
          <Text variant="captionStrong" color="link">
            Name and what it’s for
          </Text>
        </Pressable>
      ) : null}
      {people.map((p) => {
        const self = p.userId === me;
        const role = roleOf(p.role);
        const manageable =
          !self &&
          !general &&
          (canRemoveFromSpace(myRole, role) || canChangeSpaceRole(myRole, role));
        return (
          <Pressable
            key={p.userId}
            accessibilityRole="button"
            accessibilityLabel={[
              self ? `${p.person.displayName} (you)` : p.person.displayName,
              role === 'member' ? null : SPACE_ROLE_LABELS[role],
            ]
              .filter(Boolean)
              .join(', ')}
            disabled={self}
            onPress={() =>
              manageable
                ? setManaging(p)
                : router.navigate({ pathname: '/p/[id]', params: { id: p.userId } })
            }
            testID="group-person"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Avatar id={p.userId} name={p.person.displayName} url={p.person.avatarUrl} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" numberOfLines={1}>
                {self ? `${p.person.displayName} (you)` : p.person.displayName}
              </Text>
              {role === 'member' ? null : (
                <Text variant="caption" color="textSecondary">
                  {SPACE_ROLE_LABELS[role]}
                </Text>
              )}
            </View>
            {p.relationship ? (
              <RelationshipChip label={p.relationship.label} sphere={p.relationship.sphere} />
            ) : null}
          </Pressable>
        );
      })}
      {general ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setLeaving(true)}
          testID="group-leave"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}
        >
          <LogOut size={14} color={t.c.danger} />
          <Text variant="captionStrong" color="danger">
            Leave the group
          </Text>
        </Pressable>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add people"
        subtitle={
          conversation.privacyClass === 'private'
            ? 'People you’re connected with. They read what’s written from now on: what came before stays locked to the devices it was sent to.'
            : 'People you’re connected with. They’ll see what’s been written here, too.'
        }
        footer={
          <Button
            label={picked.size ? `Add ${picked.size}` : 'Add'}
            block
            size="lg"
            disabled={picked.size === 0}
            loading={busy}
            testID="group-add-confirm"
            onPress={() =>
              void (async () => {
                const n = picked.size;
                if (
                  await run(
                    () => endpoints.addToGroup(conversation.id, [...picked]),
                    `Added ${n} ${n === 1 ? 'person' : 'people'}`,
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
            exclude={inIt}
            onToggle={(uid) => setPicked((p) => toggled(p, uid))}
          />
        </View>
      </Sheet>

      <Sheet
        open={shown !== undefined}
        onClose={() => setManaging(null)}
        title={shown?.person.displayName}
        subtitle={shown ? SPACE_ROLE_LABELS[theirRole] : undefined}
      >
        {shown ? (
          <View style={{ marginHorizontal: -20 }}>
            <ListRow
              icon={MessageCircle}
              title="See their profile"
              onPress={() => {
                const who = shown.userId;
                setManaging(null);
                router.navigate({ pathname: '/p/[id]', params: { id: who } });
              }}
            />
            {canChangeSpaceRole(myRole, theirRole) ? (
              <ListRow
                icon={Settings}
                title={theirRole === 'admin' ? 'Make a member' : 'Make an admin'}
                subtitle={
                  theirRole === 'admin'
                    ? 'They stop adding and removing people, and changing the group'
                    : 'Admins add people, remove members and change the group'
                }
                testID="group-toggle-admin"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    const next = theirRole === 'admin' ? 'member' : 'admin';
                    await run(
                      () => endpoints.setGroupRole(conversation.id, who.userId, next),
                      next === 'admin'
                        ? `${who.person.displayName} is an admin`
                        : `${who.person.displayName} is a member`,
                    );
                  })()
                }
              />
            ) : null}
            {canRemoveFromSpace(myRole, theirRole) ? (
              <ListRow
                icon={UserMinus}
                title="Remove from the group"
                subtitle="They stop seeing what’s written here"
                destructive
                testID="group-remove"
                onPress={() =>
                  void (async () => {
                    const who = shown;
                    setManaging(null);
                    await run(
                      () => endpoints.removeFromGroup(conversation.id, who.userId),
                      `Removed ${who.person.displayName}`,
                    );
                  })()
                }
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave “${conversation.title}”?`}
        subtitle={
          myRole === 'owner'
            ? 'You stop getting its messages. The admin who’s been in it longest owns it after you (or whoever has been in it longest).'
            : 'You stop getting its messages. Someone in it can add you again.'
        }
        footer={
          <Button
            label="Leave"
            variant="danger"
            block
            size="lg"
            loading={busy}
            testID="group-leave-confirm"
            onPress={() =>
              void (async () => {
                setBusy(true);
                try {
                  await endpoints.removeFromGroup(conversation.id, me);
                  // Out of it, nothing of it is asked for again: its page goes, and so does
                  // what was kept of it and anything waiting to be sent about it.
                  leftConversation(conversation.id);
                  setLeaving(false);
                  router.replace('/');
                  qc.removeQueries({ queryKey: qk.conversation(conversation.id) });
                  qc.removeQueries({ queryKey: qk.memory(conversation.id) });
                  void qc.invalidateQueries({ queryKey: qk.inbox });
                  toast(`You left “${conversation.title}”`);
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
        <View />
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="The group"
        footer={
          <Button
            label="Save"
            block
            size="lg"
            loading={busy}
            disabled={!editing?.title.trim()}
            testID="group-edit-save"
            onPress={() =>
              void (async () => {
                if (!editing) return;
                if (
                  await run(
                    () =>
                      endpoints.updateConversation(conversation.id, {
                        title: editing.title.trim(),
                        purpose: editing.purpose.trim() || null,
                      }),
                    'Saved',
                  )
                )
                  setEditing(null);
              })()
            }
          />
        }
      >
        {editing ? (
          <View style={{ gap: 12 }}>
            <TextField
              label="Name"
              value={editing.title}
              onChangeText={(title) => setEditing({ ...editing, title })}
              maxLength={80}
              autoFocus
              testID="group-edit-title"
            />
            <TextField
              label="What it’s for"
              value={editing.purpose}
              onChangeText={(purpose) => setEditing({ ...editing, purpose })}
              maxLength={300}
              multiline
              placeholder="A line everyone in it sees"
              testID="group-edit-purpose"
            />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
