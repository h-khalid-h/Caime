import type { InboxItemView } from '@caime/core/api';
import { listTitle } from '@caime/core/format';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { markInboxRead } from '@/state/cache';
import { ArchiveIcon, Bell, BellOff, CheckCheck, Pin, Star, Zap } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/ui/Toast';

/** How long to mute for, loaded the first time it's asked (the Chats list loads without it). */
const MuteChoices = lazyPart(() => import('./MuteChoices').then((m) => m.MuteChoices));

/** Long-press (or right-click) actions for an inbox row. */
export function RowActions({ item, onClose }: { item: InboxItemView | null; onClose: () => void }) {
  const qc = useQueryClient();
  // What the one sheet shows: the actions, how long to mute for, or a day and time to mute to.
  const [mode, setMode] = useState<'actions' | 'mute' | 'until'>('actions');
  // biome-ignore lint/correctness/useExhaustiveDependencies: each conversation opens on its actions
  useEffect(() => setMode('actions'), [item?.id]);
  if (!item) return null;
  const close = () => {
    setMode('actions');
    onClose();
  };
  const run = async (patch: Record<string, unknown>, done: string) => {
    close();
    try {
      await endpoints.updateConversation(item.id, patch);
      toast(done);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      void qc.invalidateQueries({ queryKey: qk.inboxAll });
    }
  };
  if (mode !== 'actions')
    return (
      <Sheet
        open
        onClose={close}
        title={mode === 'mute' ? 'Mute notifications' : 'Mute until'}
        subtitle={listTitle(item)}
      >
        <MuteChoices
          picking={mode === 'until'}
          onPicking={(picking) => setMode(picking ? 'until' : 'mute')}
          onMute={(until, said) => void run({ mutedUntil: until }, said)}
        />
      </Sheet>
    );
  return (
    <Sheet
      open
      onClose={close}
      title={listTitle(item)}
      subtitle={item.relationship?.label ?? undefined}
    >
      {item.unreadCount > 0 ? (
        <ListRow
          icon={CheckCheck}
          title="Mark as read"
          onPress={() => {
            close();
            markInboxRead(qc, item.id);
            void endpoints.receipts(item.id, { read: item.lastSeq }).catch(() => {});
          }}
        />
      ) : null}
      <ListRow
        icon={Pin}
        title={item.pinned ? 'Unpin' : 'Pin to the top'}
        onPress={() => run({ pinned: !item.pinned }, item.pinned ? 'Unpinned' : 'Pinned')}
      />
      {item.attention !== 'priority' ? (
        <ListRow
          icon={Star}
          title="Always show as important"
          subtitle="Overrides your relationship rules for this conversation"
          onPress={() => run({ attention: 'priority' }, 'Marked important')}
        />
      ) : (
        <ListRow
          icon={Star}
          title="Use my usual rules"
          onPress={() => run({ attention: 'auto' }, 'Back to your usual rules')}
        />
      )}
      {item.attention !== 'quiet' ? (
        <ListRow
          icon={Zap}
          title="Keep it quiet"
          subtitle="Stays out of Needs you unless someone asks you something"
          onPress={() => run({ attention: 'quiet' }, 'Kept quiet')}
        />
      ) : null}
      {item.muted ? (
        <ListRow icon={Bell} title="Unmute" onPress={() => run({ mutedUntil: null }, 'Unmuted')} />
      ) : (
        <ListRow
          icon={BellOff}
          title="Mute notifications…"
          onPress={() => setMode('mute')}
          chevron
          testID="row-mute"
        />
      )}
      <ListRow
        icon={ArchiveIcon}
        title={item.archived ? 'Move back to Chats' : 'Archive'}
        subtitle={item.archived ? undefined : 'Comes back when there’s something new'}
        onPress={() => run({ archived: !item.archived }, item.archived ? 'Moved back' : 'Archived')}
      />
    </Sheet>
  );
}
