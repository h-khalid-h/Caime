import { msg, tr, trn } from '@caime/core/i18n';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import { LayoutGrid, ListChecks, MessageCircle, Search, Users } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { lifted } from '@/ui/shadow';
import { Text } from '@/ui/Text';
import { TAB_BAR_HEIGHT } from '@/ui/tabBarHeight';
import { useBadges } from './useBadges';

/** The four places, in the bar. You is your picture at the top of each (YouButton). */
const TABS: Record<
  string,
  { label: string; icon: IconComponent; badge?: 'chats' | 'people' | 'actions' }
> = {
  index: { label: msg('Chats'), icon: MessageCircle, badge: 'chats' },
  people: { label: msg('People'), icon: Users, badge: 'people' },
  // No badge: a space's unread shows in the list; what needs you is already on Chats (R7).
  spaces: { label: msg('Spaces'), icon: LayoutGrid },
  actions: { label: msg('Actions'), icon: ListChecks, badge: 'actions' },
};

const HEIGHT = TAB_BAR_HEIGHT;

/**
 * The phone's bar: the four places in a floating pill, the one you're in lit behind its name,
 * and Search in a circle of its own beside them, in a thumb's reach from anywhere.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const badges = useBadges();
  // A narrow phone (320 wide) keeps each tab wide enough for its name at the largest text it takes.
  const narrow = useWindowDimensions().width < 360;
  const dark = t.scheme === 'dark';
  const lit = dark ? t.c.surfaceMuted : t.c.accentSoft;
  const float: ViewStyle = {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: t.c.surface,
    borderWidth: 1,
    borderColor: t.c.border,
    ...lifted(t.c.shadow),
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: narrow ? 6 : 10,
        paddingHorizontal: narrow ? 8 : 12,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: t.c.canvas,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={[
          float,
          { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5 },
        ]}
      >
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const count = tab.badge ? badges[tab.badge] : 0;
          const color = focused ? (dark ? t.c.accent : t.c.ink) : t.c.textTertiary;
          const Icon = tab.icon;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                count
                  ? trn(count, '{label}, {n} needs you', '{label}, {n} need you', {
                      label: tr(tab.label),
                    })
                  : tr(tab.label)
              }
              testID={`tab-${route.name}`}
              haptic
              focusRadius={(HEIGHT - 12) / 2}
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
                height: HEIGHT - 12,
                borderRadius: (HEIGHT - 12) / 2,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: focused ? lit : 'transparent',
              }}
            >
              <View>
                <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 2} />
                {count > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -5,
                      end: -11,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 4,
                      backgroundColor: t.c.accentStrong,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: focused ? lit : t.c.surface,
                    }}
                  >
                    <Text
                      variant="captionStrong"
                      color={t.c.onAccentStrong}
                      style={{ fontSize: 11, lineHeight: 14 }}
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
                weight={focused ? 700 : 500}
                style={{ fontSize: 12, lineHeight: 15 }}
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {tr(tab.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('Search')}
        testID="tab-search"
        haptic
        focusRadius={HEIGHT / 2}
        onPress={() => router.push('/search')}
        style={[float, { width: HEIGHT, alignItems: 'center', justifyContent: 'center' }]}
      >
        <Search size={24} color={dark ? t.c.text : t.c.ink} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
