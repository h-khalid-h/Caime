/**
 * Meetings (R83), beside Chats and Calls: the meetings agreed in this person's conversations,
 * the last month's and what's ahead, each with its Join or its Open. A list, as Calls is, not a
 * menu (R19): a meeting is made in a conversation, from the Meeting kit. It's the calendar's
 * list with only the meetings, loaded when shown, so none of it is in the app's first download.
 */
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { Back } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';

const List = lazyPart(() => import('@/features/calendar/CalendarList').then((m) => m.MeetingsList));

export function Meetings() {
  const { desktop } = useLayout();
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          !desktop ? (
            <IconButton
              icon={Back}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : null
        }
        title={tr('Meetings')}
      />
      <List />
    </Screen>
  );
}
