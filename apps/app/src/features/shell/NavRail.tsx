import { msg, tr } from '@caime/core/i18n';
import { type Href, router } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Focus from 'lucide-react-native/icons/focus';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Search from 'lucide-react-native/icons/search';
import Users from 'lucide-react-native/icons/users';
import { View } from 'react-native';
import { useBusinessSummary } from '@/api/hooks';
import { IconMark } from '@/brand/Wordmark';
import { useBusiness } from '@/state/business';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import type { IconComponent } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { type Section, useSection } from './sections';
import { useBadges } from './useBadges';

function RailItem({
  icon: Icon,
  label,
  href,
  active,
  count,
}: {
  icon: IconComponent;
  label: string;
  href: Href;
  active: boolean;
  count?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(href)}
      focusRadius={14}
      style={{ alignItems: 'center', gap: 3, paddingVertical: 4, width: 64 }}
    >
      {({ hovered }) => (
        <>
          <View
            style={{
              width: 48,
              height: 36,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.c.accentSoft : hovered ? t.c.surfaceHover : 'transparent',
            }}
          >
            <Icon
              size={22}
              color={active ? (t.scheme === 'dark' ? t.c.accent : t.c.ink) : t.c.textSecondary}
              strokeWidth={active ? 2.4 : 2}
            />
            {count ? (
              <View
                style={{
                  position: 'absolute',
                  top: 2,
                  end: 6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 3,
                  backgroundColor: t.c.accentStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  variant="captionStrong"
                  color={t.c.onAccentStrong}
                  style={{ fontSize: 10, lineHeight: 14 }}
                  maxFontSizeMultiplier={1}
                >
                  {count > 9 ? '9+' : count}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            variant="caption"
            color={active ? 'text' : 'textSecondary'}
            weight={active ? 600 : 500}
            style={{ fontSize: 11 }}
            maxFontSizeMultiplier={1.1}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const ITEMS: Array<{
  section: Section;
  label: string;
  icon: IconComponent;
  href: Href;
  badge?: 'attention' | 'people' | 'actions';
}> = [
  {
    section: 'attention',
    label: msg('Attention'),
    icon: Focus,
    href: '/',
    badge: 'attention',
  },
  { section: 'chats', label: msg('Chats'), icon: MessageCircle, href: '/chats' },
  { section: 'people', label: msg('People'), icon: Users, href: '/people', badge: 'people' },
  { section: 'spaces', label: msg('Spaces'), icon: LayoutGrid, href: '/spaces' },
  {
    section: 'actions',
    label: msg('Actions'),
    icon: ListChecks,
    href: '/actions',
    badge: 'actions',
  },
  { section: 'search', label: msg('Search'), icon: Search, href: '/search' },
];

/** The desktop sidebar's first column. */
export function NavRail() {
  const t = useTheme();
  const section = useSection();
  const badges = useBadges();
  const user = useSession((s) => s.user);
  // On a team: its inbox (the one opened last, else the first of yours), and how many customers
  // wait on someone like you across them.
  const teams = useBusinessSummary().data?.orgs ?? [];
  const last = useBusiness((s) => s.lastTeam);
  const first = teams.find((o) => o.org.handle === last)?.org.handle ?? teams[0]?.org.handle;
  return (
    <View
      role="navigation"
      style={{
        width: 76,
        backgroundColor: t.c.surface,
        borderEndWidth: 1,
        borderEndColor: t.c.border,
        alignItems: 'center',
        paddingVertical: 14,
        gap: 6,
      }}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={tr('Caime')}
        style={{ height: 44, justifyContent: 'center' }}
      >
        <IconMark size={40} />
      </View>
      {ITEMS.map((i) => (
        <RailItem
          key={i.section}
          icon={i.icon}
          label={tr(i.label)}
          href={i.href}
          active={section === i.section}
          count={i.badge ? badges[i.badge] : undefined}
        />
      ))}
      {first ? (
        <RailItem
          icon={Briefcase}
          label={tr('Business')}
          href={{ pathname: '/o/[handle]/inbox', params: { handle: first } }}
          active={section === 'business'}
          count={teams.reduce((n, o) => n + o.waiting, 0)}
        />
      ) : null}
      <View style={{ flex: 1 }} />
      <RailItem
        icon={Bell}
        label={tr('Notifications')}
        href="/notifications"
        active={section === 'notifications'}
        count={badges.notifications}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={tr('You and settings')}
        onPress={() => router.navigate('/you')}
        focusRadius={24}
        style={{
          padding: 4,
          borderRadius: 24,
          borderWidth: 2,
          borderColor: section === 'you' ? t.c.accent : 'transparent',
        }}
      >
        {user ? (
          <Avatar id={user.id} name={user.displayName} url={user.avatarUrl} size={36} />
        ) : null}
      </Pressable>
    </View>
  );
}
