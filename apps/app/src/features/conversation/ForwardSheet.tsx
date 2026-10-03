/**
 * Forward a message (PRD §22) to other conversations, up to 20 at once. Never from a private
 * conversation, nor into one (what's there is sealed on a device, R18): those aren't offered, nor
 * any this device has seen as private whatever the server says now, and the server refuses them
 * too. Nor is a message request that has had its one message. It arrives marked as forwarded,
 * and goes to all of them or none.
 */
import type { MessageView } from '@caime/core/api';
import { listTitle } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useInboxAll } from '@/api/hooks';
import { qk } from '@/api/keys';
import { knownPrivate } from '@/features/e2ee/known';
import { PickMark, toggled } from '@/features/people/PeoplePicker';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Users } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** The server's limit on one forward. */
const FORWARD_MAX = 20;

export function ForwardSheet({ m, onClose }: { m: MessageView; onClose: () => void }) {
  const qc = useQueryClient();
  const inbox = useInboxAll();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  // One forward, sent again after an answer that never came, arrives once.
  const [clientId] = useState(uuidv4);
  // Which of them this device has seen as private: until it's known, one isn't offered.
  const [seen, setSeen] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => {
    const ids = (inbox.data?.conversations ?? []).map((c) => c.id).filter((id) => !seen.has(id));
    if (!ids.length) return;
    let live = true;
    void Promise.all(ids.map(async (id) => [id, await knownPrivate(id)] as const)).then((known) => {
      if (live) setSeen((was) => new Map([...was, ...known]));
    });
    return () => {
      live = false;
    };
  }, [inbox.data, seen]);
  const checking = (inbox.data?.conversations ?? []).some((c) => !seen.has(c.id));
  const term = find.trim().toLocaleLowerCase();
  const places = (inbox.data?.conversations ?? []).filter(
    (c) =>
      c.id !== m.conversationId &&
      c.privacyClass !== 'private' &&
      seen.get(c.id) === false &&
      // Their request unanswered, it takes one message, and has had it.
      !(c.request === 'outgoing' && c.lastMessage) &&
      (!term || listTitle(c).toLocaleLowerCase().includes(term)),
  );
  const send = async () => {
    setBusy(true);
    try {
      const n = picked.size;
      await endpoints.forward(m.id, [...picked], clientId);
      toast(n === 1 ? tr('Forwarded') : tr('Forwarded to {n} conversations', { n }));
      void qc.invalidateQueries({ queryKey: qk.inbox });
      void qc.invalidateQueries({ queryKey: qk.inboxAll });
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={tr('Forward')}
      subtitle={tr('It arrives marked as forwarded.')}
      footer={
        <Button
          label={picked.size ? tr('Send to {size}', { size: picked.size }) : tr('Send')}
          block
          size="lg"
          disabled={picked.size === 0}
          loading={busy}
          onPress={() => void send()}
          testID="forward-send"
        />
      }
    >
      <View style={{ gap: 10 }}>
        <TextField
          value={find}
          onChangeText={setFind}
          placeholder={tr('Find a conversation')}
          accessibilityLabel={tr('Find a conversation')}
          testID="forward-find"
        />
        {inbox.isPending || checking ? (
          <Text variant="body" color="textSecondary">
            {tr('Loading your conversations…')}
          </Text>
        ) : places.length === 0 ? (
          <Text variant="body" color="textSecondary">
            {term
              ? tr('No conversation by that name.')
              : tr('There’s nowhere else to forward it yet.')}
          </Text>
        ) : (
          <View style={{ marginHorizontal: -20 }}>
            {places.slice(0, 50).map((c) => {
              const on = picked.has(c.id);
              return (
                <ListRow
                  key={c.id}
                  title={listTitle(c)}
                  subtitle={
                    c.relationship?.label ??
                    (c.other ? null : tr('{memberCount} people', { memberCount: c.memberCount }))
                  }
                  checked={on}
                  left={
                    c.other ? (
                      <Avatar
                        id={c.other.id}
                        name={c.other.displayName}
                        url={c.other.avatarUrl}
                        size={36}
                      />
                    ) : undefined
                  }
                  icon={c.other ? undefined : Users}
                  right={<PickMark on={on} />}
                  onPress={() =>
                    setPicked((p) => (!on && p.size >= FORWARD_MAX ? p : toggled(p, c.id)))
                  }
                  testID="forward-to"
                />
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
  );
}
