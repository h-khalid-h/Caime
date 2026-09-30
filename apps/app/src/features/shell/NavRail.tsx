import { type Href, router } from 'expo-router';
import { View } from 'react-native';
import { useBusinessSummary } from '@/api/hooks';
import { IconMark } from '@/brand/Wordmark';
import { useBusiness } from '@/state/business';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import type { IconComponent } from '@/ui/Button';
import { Bell, Briefcase, LayoutGrid, ListChecks, MessageCircle, Search, Users } from '@/ui/icons';
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
  badge?: 'chats' | 'people' | 'actions';
}> = [
  { section: 'chats', label: 'Chats', icon: MessageCircle, href: '/', badge: 'chats' },
  { section: 'people', label: 'People', icon: Users, href: '/people', badge: 'people' },
  { section: 'spaces', label: 'Spaces', icon: LayoutGrid, href: '/spaces' },
  { section: 'actions', label: 'Actions', icon: ListChecks, href: '/actions', badge: 'actions' },
  { section: 'search', label: 'Search', icon: Search, href: '/search' },
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
      <View style={{ height: 44, justifyContent: 'center' }} accessibilityLabel="Caime">
        <IconMark size={40} />
      </View>
      {ITEMS.map((i) => (
        <RailItem
          key={i.section}
          icon={i.icon}
          label={i.label}
          href={i.href}
          active={section === i.section}
          count={i.badge ? badges[i.badge] : undefined}
        />
      ))}
      {first ? (
        <RailItem
          icon={Briefcase}
          label="Business"
          href={{ pathname: '/o/[handle]/inbox', params: { handle: first } }}
          active={section === 'business'}
          count={teams.reduce((n, o) => n + o.waiting, 0)}
        />
      ) : null}
      <View style={{ flex: 1 }} />
      <RailItem
        icon={Bell}
        label="Alerts"
        href="/notifications"
        active={section === 'notifications'}
        count={badges.notifications}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="You and settings"
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
