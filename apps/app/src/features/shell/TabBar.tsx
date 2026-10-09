import { msg, tr, trn } from '@caime/core/i18n';
import { router, usePathname } from 'expo-router';
import Focus from 'lucide-react-native/icons/focus';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Search from 'lucide-react-native/icons/search';
import Users from 'lucide-react-native/icons/users';
import { useEffect } from 'react';
import { useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '@/lib/keyboard';
import { usePhoneBar } from '@/state/phoneBar';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { lifted } from '@/ui/shadow';
import { Text } from '@/ui/Text';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT, TAB_BAR_TOP } from '@/ui/tabBarHeight';
import { litPlace, PLACES, type Place, phoneBarShown, placeAt, placePath } from './phoneBar';
import { useBadges } from './useBadges';

/** The five places, in the bar. You is your picture at the top of each (YouButton). */
const TABS: Record<
  Place,
  { label: string; icon: IconComponent; badge?: 'attention' | 'people' | 'actions' }
> = {
  // The first screen (R66): what needs you is counted here, not on Chats.
  index: { label: msg('Attention'), icon: Focus, badge: 'attention' },
  chats: { label: msg('Chats'), icon: MessageCircle },
  people: { label: msg('People'), icon: Users, badge: 'people' },
  // No badge: a space's unread shows in the list; what needs you is already on Chats (R7).
  spaces: { label: msg('Spaces'), icon: LayoutGrid },
  actions: { label: msg('Actions'), icon: ListChecks, badge: 'actions' },
};

const HEIGHT = TAB_BAR_HEIGHT;

/**
 * Goes to a place's root from wherever someone is: what was opened over the places closes, so
 * a person's page to Spaces is one tap, and Back from Spaces doesn't lead through it again.
 */
function goTo(place: Place) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(placePath(place));
}

/**
 * The phone's bar: the five places in a floating pill, the one you're in lit behind its name,
 * and Search in a circle of its own beside them, in a thumb's reach. It's on every screen a
 * person moves between places from (a place, someone's page, a space, settings), not only the
 * five, and steps aside where it would sit on what they're doing (`phoneBarShown`: a
 * conversation's composer, a form that makes something) and, where the keyboard pushes the screen
 * up (Android), while they type. Hidden, it stays mounted, so its counts keep listening rather
 * than asking again each time it's back.
 */
export function TabBar() {
  const pathname = usePathname();
  const typing = useKeyboardOpen();
  const at = placeAt(pathname);
  const last = usePhoneBar((s) => s.last);
  const shown = phoneBarShown(pathname) && !typing;
  useEffect(() => {
    if (at) usePhoneBar.setState({ last: at });
  }, [at]);
  useEffect(() => {
    usePhoneBar.setState({ shown });
  }, [shown]);
  useEffect(() => () => usePhoneBar.setState({ shown: false }), []);
  return <Bar shown={shown} place={litPlace(pathname, last)} searching={pathname === '/search'} />;
}

function Bar({
  shown,
  place: litOne,
  searching,
}: {
  shown: boolean;
  /** The place lit: the one open, or the one someone came from. */
  place: Place | null;
  searching: boolean;
}) {
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
        display: shown ? 'flex' : 'none',
        flexDirection: 'row',
        alignItems: 'center',
        gap: narrow ? 6 : 10,
        paddingHorizontal: narrow ? 8 : 12,
        paddingTop: TAB_BAR_TOP,
        paddingBottom: Math.max(insets.bottom, TAB_BAR_GAP),
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
        {PLACES.map((place) => {
          const tab = TABS[place];
          const focused = place === litOne;
          const count = tab.badge ? badges[tab.badge] : 0;
          const color = focused ? (dark ? t.c.accent : t.c.ink) : t.c.textTertiary;
          const Icon = tab.icon;
          return (
            <Pressable
              key={place}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                count
                  ? trn(count, '{label}, {n} needs you', '{label}, {n} need you', {
                      label: tr(tab.label),
                    })
                  : tr(tab.label)
              }
              testID={`tab-${place}`}
              haptic
              focusRadius={(HEIGHT - 12) / 2}
              onPress={() => goTo(place)}
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
        accessibilityState={{ selected: searching }}
        testID="tab-search"
        haptic
        focusRadius={HEIGHT / 2}
        onPress={() => {
          if (!searching) router.push('/search');
        }}
        style={[
          float,
          {
            width: HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: searching ? lit : t.c.surface,
          },
        ]}
      >
        <Search size={24} color={dark ? t.c.text : t.c.ink} strokeWidth={searching ? 2.6 : 2.2} />
      </Pressable>
    </View>
  );
}
