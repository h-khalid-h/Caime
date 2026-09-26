import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import { CircleUser, ListChecks, MessageCircle, Users } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { useBadges } from './useBadges';

const TABS: Record<
  string,
  { label: string; icon: IconComponent; badge?: 'chats' | 'people' | 'actions' }
> = {
  index: { label: 'Chats', icon: MessageCircle, badge: 'chats' },
  people: { label: 'People', icon: Users, badge: 'people' },
  actions: { label: 'Actions', icon: ListChecks, badge: 'actions' },
  you: { label: 'You', icon: CircleUser },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const badges = useBadges();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.c.surface,
        borderTopWidth: 1,
        borderTopColor: t.c.border,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 6,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const count = tab.badge ? badges[tab.badge] : 0;
        const color = focused ? (t.scheme === 'dark' ? t.c.accent : t.c.ink) : t.c.textTertiary;
        const Icon = tab.icon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={count ? `${tab.label}, ${count} need you` : tab.label}
            testID={`tab-${route.name}`}
            haptic
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented)
                navigation.navigate(route.name, route.params);
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 50,
              gap: 3,
            }}
          >
            <View>
              <Icon size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
              {count > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: t.c.accentStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: t.c.surface,
                  }}
                >
                  <Text
                    variant="overline"
                    color={t.c.onAccentStrong}
                    style={{ textTransform: 'none' }}
                    maxFontSizeMultiplier={1}
                  >
                    {count > 9 ? '9+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              variant="caption"
              color={color}
              weight={focused ? 600 : 500}
              maxFontSizeMultiplier={1.2}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
