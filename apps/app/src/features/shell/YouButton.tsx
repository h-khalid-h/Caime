import type { MeView, PresenceSetting, PresenceState } from '@caishy/core/api';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';
import { endpoints } from '@/api/endpoints';
import { PresenceChoice } from '@/features/settings/PresenceChoice';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { Bell, Lock, Settings, Smile } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** Your presence as a dot: none when you're Invisible. */
const DOT: Record<PresenceSetting, PresenceState | null> = {
  auto: 'online',
  available: 'online',
  busy: 'busy',
  away: 'away',
  invisible: null,
};
const SAID: Record<PresenceState, string> = {
  online: 'Online',
  busy: 'Busy',
  away: 'Away',
  offline: 'Offline',
};

/** The dot the people you know see: none when your privacy shows your online status to nobody. */
function shownDot(me: MeView): PresenceState | null {
  return me.privacy.fields.onlineStatus.kind === 'nobody' ? null : DOT[me.presence];
}

type Chosen = 'auto' | 'busy' | 'away' | 'invisible';

/** One sheet for the four places (the phone's tabs layout draws it), whichever opened it. */
const useYouSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

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
      accessibilityLabel={dot ? `You, ${me.displayName}, ${SAID[dot]}` : `You, ${me.displayName}`}
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

export function YouSheet() {
  const t = useTheme();
  const me = useSession((s) => s.user);
  const open = useYouSheet((s) => s.open);
  const setOpen = useYouSheet((s) => s.setOpen);
  // The presence tapped, shown at once while it's saved; one saved at a time, the last tap last.
  const [pending, setPending] = useState<Chosen | null>(null);
  const saving = useRef(false);
  const next = useRef<Chosen | null>(null);
  // Gone with the phone's layout (a window made wide): closed, not open again on the way back.
  useEffect(() => () => setOpen(false), [setOpen]);
  if (!me) return null;
  const close = () => setOpen(false);
  const go = (href: Href) => {
    close();
    router.navigate(href);
  };
  const presence: Chosen = me.presence === 'available' ? 'auto' : me.presence;
  const save = async (choice: Chosen): Promise<void> => {
    saving.current = true;
    try {
      const res = await endpoints.updateMe({ presence: choice });
      useSession.getState().setUser(res.user);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
    saving.current = false;
    const then = next.current;
    next.current = null;
    if (then && then !== choice) return save(then);
    setPending(null);
  };
  const choose = (choice: Chosen) => {
    if (choice === (pending ?? presence)) return;
    setPending(choice);
    if (saving.current) next.current = choice;
    else void save(choice);
  };
  const status = [me.statusEmoji, me.statusText].filter(Boolean).join(' ');
  return (
    <Sheet open={open} onClose={close} title="You">
      <View style={{ gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${me.displayName}, edit profile`}
          onPress={() => go('/settings/profile')}
          style={({ hovered }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 12,
            borderRadius: 20,
            backgroundColor: hovered ? t.c.surfaceHover : t.c.surfaceMuted,
          })}
        >
          <Avatar
            id={me.id}
            name={me.displayName}
            url={me.avatarUrl}
            size={56}
            presence={shownDot(me)}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" numberOfLines={1}>
              {me.displayName}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              @{me.handle}
            </Text>
          </View>
        </Pressable>
        <Card padded={false}>
          <ListRow
            icon={Smile}
            title={status || 'Set a status'}
            subtitle={status ? 'Your status' : undefined}
            chevron
            onPress={() => go('/settings/profile')}
            testID="you-status"
          />
        </Card>
        <View style={{ gap: 6 }}>
          <Text variant="overline" color="textTertiary" accessibilityRole="header">
            Presence
          </Text>
          <Card padded={false}>
            <PresenceChoice value={pending ?? presence} onChange={choose} />
          </Card>
        </View>
        <Card padded={false}>
          <ListRow
            icon={Bell}
            title="Notifications and priorities"
            chevron
            onPress={() => go('/settings/notifications')}
          />
          <ListRow icon={Lock} title="Privacy" chevron onPress={() => go('/settings/privacy')} />
          <ListRow
            icon={Settings}
            title="All settings"
            subtitle="Appearance, security, your plan and more"
            chevron
            onPress={() => go('/you')}
            testID="you-all"
          />
        </Card>
      </View>
    </Sheet>
  );
}
