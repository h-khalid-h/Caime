import { type Href, router, usePathname } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import type { IconComponent } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { Bell, Info, Lock, LogOut, Palette, Shield, UserRound } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

const ITEMS: Array<{
  href: Href;
  path: string;
  icon: IconComponent;
  title: string;
  subtitle: string;
}> = [
  {
    href: '/settings/profile',
    path: '/settings/profile',
    icon: UserRound,
    title: 'Profile',
    subtitle: 'Name, photo, status, pronouns',
  },
  {
    href: '/settings/appearance',
    path: '/settings/appearance',
    icon: Palette,
    title: 'Appearance',
    subtitle: 'Theme, style, your bubble colour',
  },
  {
    href: '/settings/notifications',
    path: '/settings/notifications',
    icon: Bell,
    title: 'Notifications and priorities',
    subtitle: 'Who reaches you, and when',
  },
  {
    href: '/settings/privacy',
    path: '/settings/privacy',
    icon: Lock,
    title: 'Privacy',
    subtitle: 'Who sees what, who can find you',
  },
  {
    href: '/settings/security',
    path: '/settings/security',
    icon: Shield,
    title: 'Security',
    subtitle: 'Devices, password, recovery codes',
  },
  {
    href: '/settings/about',
    path: '/settings/about',
    icon: Info,
    title: 'About Caishy',
    subtitle: 'Version, terms, help',
  },
];

export function SettingsMenu({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const pathname = usePathname();
  if (!user) return null;
  const content = (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <PageHeader title="You" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${user.displayName}, edit profile`}
        onPress={() => router.navigate('/settings/profile')}
        style={({ hovered }) => ({
          marginHorizontal: 16,
          padding: 16,
          borderRadius: 20,
          backgroundColor: hovered ? t.c.surfaceHover : t.c.surface,
          borderWidth: 1,
          borderColor: t.c.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        })}
      >
        <Avatar id={user.id} name={user.displayName} url={user.avatarUrl} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text variant="caption" color="textSecondary">
            @{user.handle}
          </Text>
          {user.statusText ? (
            <Text variant="caption" numberOfLines={1}>
              {user.statusEmoji ? `${user.statusEmoji} ` : ''}
              {user.statusText}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={{ padding: 16, gap: 12 }}>
        <Card padded={false}>
          {ITEMS.map((i, idx) => (
            <View key={i.path}>
              {idx > 0 ? <Divider inset={52} /> : null}
              <ListRow
                icon={i.icon}
                title={i.title}
                subtitle={i.subtitle}
                chevron={!pane}
                selected={pane && pathname === i.path}
                onPress={() => router.navigate(i.href)}
                testID={`settings-${i.path.split('/').pop()}`}
              />
            </View>
          ))}
        </Card>
        <Card padded={false}>
          <ListRow
            icon={LogOut}
            title="Sign out"
            destructive
            onPress={() => void useSession.getState().signOut()}
            testID="sign-out"
          />
        </Card>
      </View>
    </ScrollView>
  );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
