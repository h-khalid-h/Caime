import { msg, tr } from '@caime/core/i18n';
import { PLAN_NAMES } from '@caime/core/plans';
import { type Href, router, usePathname } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Bell from 'lucide-react-native/icons/bell';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Building from 'lucide-react-native/icons/building';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import ChartBar from 'lucide-react-native/icons/chart-no-axes-column';
import Gauge from 'lucide-react-native/icons/gauge';
import Globe from 'lucide-react-native/icons/globe';
import Info from 'lucide-react-native/icons/info';
import KeyRound from 'lucide-react-native/icons/key-round';
import Keyboard from 'lucide-react-native/icons/keyboard';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Palette from 'lucide-react-native/icons/palette';
import Shield from 'lucide-react-native/icons/shield';
import Sparkles from 'lucide-react-native/icons/sparkles';
import UserRound from 'lucide-react-native/icons/user-round';
import Zap from 'lucide-react-native/icons/zap';
import { Platform, ScrollView, View } from 'react-native';
import { useOrgs } from '@/api/hooks';
import { useShortcutsSheet } from '@/features/shell/shortcuts';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import type { IconComponent } from '@/ui/Button';
import { Card, Divider } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
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
    title: msg('Profile'),
    subtitle: msg('Name, photo, status, pronouns'),
  },
  {
    href: '/settings/region',
    path: '/settings/region',
    icon: Globe,
    title: msg('Language and region'),
    subtitle: msg('Country, time zone, how dates and numbers look'),
  },
  {
    href: '/settings/appearance',
    path: '/settings/appearance',
    icon: Palette,
    title: msg('Appearance'),
    subtitle: msg('Theme, style, your bubble colour'),
  },
  {
    href: '/settings/notifications',
    path: '/settings/notifications',
    icon: Bell,
    title: msg('Notifications and priorities'),
    subtitle: msg('Who reaches you, and when'),
  },
  {
    href: '/settings/bookings',
    path: '/settings/bookings',
    icon: CalendarCheck,
    // One place for what someone offers (R58, R60, R61, R62): booked, ordered or paid.
    title: msg('What you offer'),
    subtitle: msg('Bookings, orders and ways to be paid'),
  },
  {
    href: '/settings/saved',
    path: '/settings/saved',
    icon: Bookmark,
    title: msg('Saved'),
    subtitle: msg('What you and your automations kept'),
  },
  {
    href: '/settings/cai',
    path: '/settings/cai',
    icon: Sparkles,
    title: msg('Cai'),
    subtitle: msg('Your morning brief, follow-ups, what it has learned'),
  },
  {
    href: '/settings/automations',
    path: '/settings/automations',
    icon: Zap,
    title: msg('Automations'),
    subtitle: msg('Keep what arrives, reminders, quiet hours'),
  },
  {
    href: '/settings/insights',
    path: '/settings/insights',
    icon: ChartBar,
    title: msg('Relationship insights'),
    subtitle: msg('How your relationships are going, for you only'),
  },
  {
    href: '/settings/privacy',
    path: '/settings/privacy',
    icon: Lock,
    title: msg('Privacy'),
    subtitle: msg('Who sees what, who can find you'),
  },
  {
    href: '/settings/security',
    path: '/settings/security',
    icon: Shield,
    title: msg('Security'),
    subtitle: msg('Devices, password, recovery codes'),
  },
  {
    href: '/settings/connected',
    path: '/settings/connected',
    icon: LayoutGrid,
    title: msg('Connected apps'),
    subtitle: msg('Your calendar, and apps you let act for you'),
  },
  {
    href: '/settings/developer',
    path: '/settings/developer',
    icon: KeyRound,
    title: msg('Developer'),
    subtitle: msg('Tokens for your scripts, apps for other people'),
  },
  {
    href: '/settings/about',
    path: '/settings/about',
    icon: Info,
    title: msg('About Caime'),
    subtitle: msg('Version, terms, help'),
  },
];

export function SettingsMenu({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const pathname = usePathname();
  // The teams you're on, by name: the row says where it goes before it's opened.
  const teams = (useOrgs().data?.orgs ?? []).map((o) => o.name);
  if (!user) return null;
  const content = (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <PageHeader
        title={tr('You')}
        left={
          pane ? undefined : (
            <IconButton
              icon={ArrowLeft}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
              testID="you-back"
            />
          )
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('{displayName}, edit profile', { displayName: user.displayName })}
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
                title={tr(i.title)}
                subtitle={tr(i.subtitle)}
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
            icon={Gauge}
            title={tr('Plan')}
            subtitle={
              user.plan === 'personal' ? tr('Personal · free forever') : PLAN_NAMES[user.plan]
            }
            chevron={!pane}
            selected={pane && pathname === '/settings/plan'}
            onPress={() => router.navigate('/settings/plan')}
            testID="settings-plan"
          />
        </Card>
        <Card padded={false}>
          <ListRow
            icon={Building}
            title={tr('Organizations')}
            subtitle={
              teams.length
                ? teams.slice(0, 3).join(', ') +
                  (teams.length > 3 ? ` and ${teams.length - 3} more` : '')
                : tr('Your business, clinic or school, verified')
            }
            chevron={!pane}
            selected={pane && (pathname.startsWith('/orgs') || pathname.startsWith('/o/'))}
            onPress={() => router.navigate('/orgs')}
            testID="settings-orgs"
          />
        </Card>
        {Platform.OS === 'web' ? (
          <Card padded={false}>
            <ListRow
              icon={Keyboard}
              title={tr('Keyboard shortcuts')}
              subtitle={tr('Press ? anywhere to see them')}
              onPress={() => useShortcutsSheet.getState().setOpen(true)}
            />
          </Card>
        ) : null}
        <Card padded={false}>
          <ListRow
            icon={LogOut}
            title={tr('Sign out')}
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
