/**
 * Where to send something on, up to 20 conversations at once: a forward (PRD §22), a call's
 * recording shared on (R114 (7), M17 I13e). Never a private conversation (what's there is sealed
 * on a device, R18): none is offered, nor any this device has seen as private whatever the server
 * says now, and the server refuses them too. Nor a message request that has had its one message.
 * The sender's own rule decides the rest (`onSend`), and it goes to all of them or none. Loaded
 * apart wherever it's opened (`LAZY_EVERYWHERE`).
 */
import { listTitle } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import Users from 'lucide-react-native/icons/users';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useInboxAll } from '@/api/hooks';
import { knownPrivate } from '@/features/e2ee/known';
import { toggled } from '@/lib/toggled';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** The server's limit on one send. */
const SEND_TO_MAX = 20;

export function SendToSheet({
  exclude,
  title,
  subtitle,
  nowhere,
  onSend,
  onClose,
  testID = 'forward',
}: {
  /** The conversation the thing is already in: never offered. */
  exclude: string | null;
  title: string;
  subtitle: string;
  /** What to say when there's no conversation to offer. */
  nowhere: string;
  /** Sends it to the chosen conversations and says so; the sheet closes once it has. */
  onSend: (conversationIds: string[], clientId: string) => Promise<void>;
  onClose: () => void;
  testID?: string;
}) {
  const inbox = useInboxAll();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  // One send, sent again after an answer that never came, arrives once.
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
      c.id !== exclude &&
      c.privacyClass !== 'private' &&
      seen.get(c.id) === false &&
      // Their request unanswered, it takes one message, and has had it.
      !(c.request === 'outgoing' && c.lastMessage) &&
      (!term || listTitle(c).toLocaleLowerCase().includes(term)),
  );
  const send = async () => {
    setBusy(true);
    try {
      await onSend([...picked], clientId);
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
      title={title}
      subtitle={subtitle}
      footer={
        <Button
          label={picked.size ? tr('Send to {count}', { count: picked.size }) : tr('Send')}
          block
          size="lg"
          disabled={picked.size === 0}
          loading={busy}
          onPress={() => void send()}
          testID={`${testID}-send`}
        />
      }
    >
      <View style={{ gap: 10 }}>
        <TextField
          value={find}
          onChangeText={setFind}
          placeholder={tr('Find a conversation')}
          accessibilityLabel={tr('Find a conversation')}
          testID={`${testID}-find`}
        />
        {inbox.isPending || checking ? (
          <Text variant="body" color="textSecondary">
            {tr('Loading your conversations…')}
          </Text>
        ) : places.length === 0 ? (
          <Text variant="body" color="textSecondary">
            {term ? tr('No conversation by that name.') : nowhere}
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
                  onPress={() =>
                    setPicked((p) => (!on && p.size >= SEND_TO_MAX ? p : toggled(p, c.id)))
                  }
                  testID={`${testID}-to`}
                />
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
  );
}
