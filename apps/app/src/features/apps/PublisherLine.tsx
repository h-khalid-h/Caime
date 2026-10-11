/**
 * Who made an app (review 2026-10-09 M8): one line wherever an app is shown (consent, Connected,
 * Discover, an organization's setup): "By {name}", verified as the organization is, and a tap
 * to the publisher's own page, so whoever is asked to let an app in can see who's asking.
 */
import type { AppPublisher } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { type Href, router } from 'expo-router';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** The publisher's page: an organization's, or a person's by handle; Caime's own has none. */
export function publisherHref(p: AppPublisher): Href | null {
  if (!p.handle) return null;
  if (p.kind === 'org') return { pathname: '/o/[handle]', params: { handle: p.handle } };
  if (p.kind === 'person') return { pathname: '/[at]', params: { at: `@${p.handle}` } };
  return null;
}

export function PublisherLine({ publisher, testID }: { publisher: AppPublisher; testID?: string }) {
  const t = useTheme();
  const href = publisherHref(publisher);
  const line = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text variant="caption" color={href ? 'accentStrong' : 'textSecondary'} numberOfLines={1}>
        {tr('By {name}', { name: publisher.name })}
      </Text>
      {publisher.verified ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={tr('Verified')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <BadgeCheck size={14} color={t.c.accentStrong} />
          <Text variant="caption" color="accentStrong">
            {tr('Verified')}
          </Text>
        </View>
      ) : null}
    </View>
  );
  if (!href) return <View testID={testID}>{line}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={tr('By {name}', { name: publisher.name })}
      onPress={() => router.navigate(href)}
      focusRadius={6}
      style={{ alignSelf: 'flex-start' }}
      testID={testID}
    >
      {line}
    </Pressable>
  );
}
