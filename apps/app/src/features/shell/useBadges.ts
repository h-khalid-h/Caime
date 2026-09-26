import { useInbox, useNotifications, useRequests, useTasks } from '@/api/hooks';

/** The numbers on the tabs: what needs you, not everything unread (R7). */
export function useBadges() {
  const inbox = useInbox();
  const requests = useRequests('incoming');
  const tasks = useTasks('todo');
  const notifications = useNotifications();
  return {
    chats: inbox.data?.counts.needs_you ?? 0,
    people: requests.data?.requests.length ?? 0,
    actions: (tasks.data?.counts.overdue ?? 0) + (tasks.data?.counts.asked_me ?? 0),
    notifications: notifications.data?.unread ?? 0,
  };
}
