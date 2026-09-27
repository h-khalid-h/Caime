import type { PresenceSetting, PresenceState } from '@caishy/core/api';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { Bell, Lock, Settings, Smile } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** Your own dot, as the people you know see it; none when you're Invisible. */
const SHOWN: Record<PresenceSetting, PresenceState | null> = {
  auto: 'online',
  available: 'online',
  busy: 'busy',
  away: 'away',
  invisible: null,
};

type Choice = 'auto' | 'busy' | 'away' | 'invisible';

/**
 * You, at the top of each place on a phone: your picture, with the dot the people you know see.
 * It opens what you change most (status, presence) and the way to everything else.
 */
export function YouButton() {
  const me = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`You, ${me.displayName}`}
        testID="you-button"
        haptic
        focusRadius={22}
        onPress={() => setOpen(true)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Avatar
          id={me.id}
          name={me.displayName}
          url={me.avatarUrl}
          size={36}
          presence={SHOWN[me.presence]}
        />
      </Pressable>
      <YouSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function YouSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const me = useSession((s) => s.user);
  if (!me) return null;
  const go = (href: Href) => {
    onClose();
    router.navigate(href);
  };
  const presence: Choice = me.presence === 'available' ? 'auto' : me.presence;
  const setPresence = async (next: Choice) => {
    if (next === presence) return;
    try {
      const res = await endpoints.updateMe({ presence: next });
      useSession.getState().setUser(res.user);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const status = [me.statusEmoji, me.statusText].filter(Boolean).join(' ');
  return (
    <Sheet open={open} onClose={onClose} title="You">
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
            presence={SHOWN[me.presence]}
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
          <Text variant="overline" color="textTertiary">
            Presence
          </Text>
          <Segmented<Choice>
            label="Presence"
            value={presence}
            onChange={(v) => void setPresence(v)}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'busy', label: 'Busy' },
              { value: 'away', label: 'Away' },
              { value: 'invisible', label: 'Invisible' },
            ]}
          />
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
