/**
 * Call history (PRD §47) loads when it's shown: the Calls screen and the calls on someone's page
 * both come through here, so neither puts it in the app's first download. Each part is behind a
 * boundary, so one that can't load (a deploy replaced it) leaves the rest of the app as it was;
 * the Calls screen draws its bar, with a way back, before its list has loaded.
 */

import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';

const Body = lazyPart(() => import('./CallHistory').then((m) => m.CallHistoryBody));
export const CallRows = lazyPart(() => import('./CallHistory').then((m) => m.CallRows));

export function CallHistory({ withId, withName }: { withId?: string; withName?: string }) {
  const { desktop } = useLayout();
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          !desktop || withId ? (
            <IconButton
              icon={ArrowLeft}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : null
        }
        title={withId ? tr('Calls with {withName}', { withName: withName ?? 'them' }) : tr('Calls')}
      />
      <Body withId={withId} withName={withName} />
    </Screen>
  );
}
