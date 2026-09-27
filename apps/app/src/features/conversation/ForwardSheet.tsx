/**
 * Forward a message (PRD §22) to other conversations, up to 20 at once. Never from a private
 * conversation, nor into one (what's there is sealed on a device, R18): those aren't offered, and
 * the server refuses them too. It arrives marked as forwarded, and goes to all of them or none.
 */
import type { MessageView } from '@caishy/core/api';
import { uuidv4 } from '@caishy/core/ids';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useInboxAll } from '@/api/hooks';
import { qk } from '@/api/keys';
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
  const term = find.trim().toLocaleLowerCase();
  const places = (inbox.data?.conversations ?? []).filter(
    (c) =>
      c.id !== m.conversationId &&
      c.privacyClass !== 'private' &&
      (!term || c.title.toLocaleLowerCase().includes(term)),
  );
  const send = async () => {
    setBusy(true);
    try {
      const n = picked.size;
      await endpoints.forward(m.id, [...picked], clientId);
      toast(n === 1 ? 'Forwarded' : `Forwarded to ${n} conversations`);
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
      title="Forward"
      subtitle="It arrives marked as forwarded."
      footer={
        <Button
          label={picked.size ? `Send to ${picked.size}` : 'Send'}
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
          placeholder="Find a conversation"
          accessibilityLabel="Find a conversation"
          testID="forward-find"
        />
        {inbox.isPending ? (
          <Text variant="body" color="textSecondary">
            Loading your conversations…
          </Text>
        ) : places.length === 0 ? (
          <Text variant="body" color="textSecondary">
            {term ? 'No conversation by that name.' : 'There’s nowhere else to forward it yet.'}
          </Text>
        ) : (
          <View style={{ marginHorizontal: -20 }}>
            {places.slice(0, 50).map((c) => {
              const on = picked.has(c.id);
              return (
                <ListRow
                  key={c.id}
                  title={c.title}
                  subtitle={c.relationship?.label ?? (c.other ? null : `${c.memberCount} people`)}
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
