import type { MeView, PresenceSetting, PresenceState } from '@caime/core/api';
import { msg, tr } from '@caime/core/i18n';
import { useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { useYouSheet } from './youSheet';

/** Your presence as a dot: none when you're Invisible. */
const DOT: Record<PresenceSetting, PresenceState | null> = {
  auto: 'online',
  available: 'online',
  busy: 'busy',
  away: 'away',
  invisible: null,
};
const SAID: Record<PresenceState, string> = {
  online: msg('Online'),
  busy: msg('Busy'),
  away: msg('Away'),
  offline: msg('Offline'),
};

/** The dot the people you know see: none when your privacy shows your online status to nobody. */
export function shownDot(me: MeView): PresenceState | null {
  return me.privacy.fields.onlineStatus.kind === 'nobody' ? null : DOT[me.presence];
}

/**
 * You, at the top of each place on a phone: your picture, with the dot the people you know see.
 * It opens what you change most (status, presence) and the way to everything else.
 */
export function YouButton() {
  const me = useSession((s) => s.user);
  if (!me) return null;
  const dot = shownDot(me);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        dot
          ? tr('You, {displayName}, {state}', { displayName: me.displayName, state: tr(SAID[dot]) })
          : tr('You, {displayName}', { displayName: me.displayName })
      }
      testID="you-button"
      haptic
      focusRadius={22}
      onPress={() => useYouSheet.getState().setOpen(true)}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Avatar id={me.id} name={me.displayName} url={me.avatarUrl} size={36} presence={dot} />
    </Pressable>
  );
}

/** The sheet, mounted the first time it's opened and kept so it can slide away as it closes. */
const Body = lazyPart(() => import('./YouSheetBody').then((m) => m.YouSheetBody));

export function YouSheet() {
  const open = useYouSheet((s) => s.open);
  const opened = useOpened(open);
  return opened ? <Body /> : null;
}
