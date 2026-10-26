/**
 * A contact in a message (M16 E8c). Someone on Caime is kept as their id alone and read through
 * their profile, so each reader sees them exactly as the profile shows them to that reader (its
 * privacy, R29's rules, a block): one the reader may not see says so, never a name. A tap opens
 * the profile. A contact from elsewhere (a name with a number or an address) shows what it carries.
 */
import type { MessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import UserRound from 'lucide-react-native/icons/user-round';
import { View } from 'react-native';
import { usePerson } from '@/api/hooks';
import { Avatar } from '@/ui/Avatar';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

export function ContactBody({
  m,
  fg,
  meta,
  onHold,
}: {
  m: MessageView;
  fg: string;
  meta: string;
  onHold?: () => void;
}) {
  const p = m.payload as { userId?: string; name?: string; phone?: string; email?: string };
  if (!p.userId)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <UserRound size={18} color={fg} />
        <View style={{ flexShrink: 1 }}>
          <Text variant="message" color={fg} auto>
            {p.name ?? tr('Contact')}
          </Text>
          {p.phone || p.email ? (
            <Text variant="caption" color={meta} selectable>
              {p.phone ?? p.email}
            </Text>
          ) : null}
        </View>
      </View>
    );
  return <OnCaime userId={p.userId} fg={fg} meta={meta} onHold={onHold} />;
}

function OnCaime({
  userId,
  fg,
  meta,
  onHold,
}: {
  userId: string;
  fg: string;
  meta: string;
  onHold?: () => void;
}) {
  const q = usePerson(userId);
  const person = q.data?.person ?? null;
  if (!person)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} testID="contact-card">
        <UserRound size={18} color={meta} />
        <Text variant="message" color={meta} style={{ fontStyle: 'italic' }}>
          {q.isError ? tr('This contact isn’t available to you.') : tr('Contact')}
        </Text>
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('Contact: {name}', { name: person.displayName })}
      onPress={() => router.push({ pathname: '/p/[id]', params: { id: person.id } })}
      onLongPress={onHold}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 }}
      testID="contact-card"
    >
      <Avatar id={person.id} name={person.displayName} url={person.avatarUrl} size={36} />
      <View style={{ flexShrink: 1 }}>
        <Text variant="bodyStrong" color={fg} auto numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text variant="caption" color={meta} numberOfLines={1}>
          {`@${person.handle}`}
        </Text>
      </View>
    </Pressable>
  );
}
