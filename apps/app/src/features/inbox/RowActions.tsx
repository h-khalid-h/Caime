import type { InboxItemView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { markInboxRead } from '@/state/cache';
import { ArchiveIcon, Bell, BellOff, CheckCheck, Pin, Star, Zap } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/ui/Toast';

/** Long-press (or right-click) actions for an inbox row. */
export function RowActions({ item, onClose }: { item: InboxItemView | null; onClose: () => void }) {
  const qc = useQueryClient();
  if (!item) return null;
  const run = async (patch: Record<string, unknown>, done: string) => {
    onClose();
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
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.title}
      subtitle={item.relationship?.label ?? undefined}
    >
      {item.unreadCount > 0 ? (
        <ListRow
          icon={CheckCheck}
          title="Mark as read"
          onPress={() => {
            onClose();
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
        <>
          <ListRow
            icon={BellOff}
            title="Mute for 8 hours"
            onPress={() => run({ mutedUntil: hours(8) }, 'Muted for 8 hours')}
          />
          <ListRow
            icon={BellOff}
            title="Mute for a week"
            onPress={() => run({ mutedUntil: hours(24 * 7) }, 'Muted for a week')}
          />
        </>
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
