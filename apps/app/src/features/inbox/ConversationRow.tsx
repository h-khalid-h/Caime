import type { InboxItemView } from '@caime/core/api';
import { formatListTime, joinNames, listTitle } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import BellOff from 'lucide-react-native/icons/bell-off';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Pin from 'lucide-react-native/icons/pin';
import Users from 'lucide-react-native/icons/users';
import { memo } from 'react';
import { View } from 'react-native';
import { OrgMark } from '@/features/orgs/kinds';
import { typingIn, useLive } from '@/state/live';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Badge } from '@/ui/Badge';
import { Chip, RelationshipChip } from '@/ui/Chip';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** Reasons worth a line of their own: the ones that explain why the row is where it is (R8). */
const EXPLAINING = new Set([
  'overdue',
  'due_soon',
  'request_to_you',
  'mentioned_you',
  'asked_you',
  'follow_up_due',
  'waiting_on_them',
  'awaiting_reply',
  'priority_relationship',
  'you_marked_priority',
  'message_request',
]);

export interface ConversationRowProps {
  item: InboxItemView;
  now: Date;
  timeZone: string;
  locale: string;
  selected?: boolean;
  onPress: (item: InboxItemView) => void;
  onLongPress?: (item: InboxItemView) => void;
}

export const ConversationRow = memo(function ConversationRow({
  item,
  now,
  timeZone,
  locale,
  selected,
  onPress,
  onLongPress,
}: ConversationRowProps) {
  const t = useTheme();
  const typing = useLive((s) => typingIn(s, item.id).length > 0);
  const presence = useLive((s) => (item.other ? s.presence[item.other.id] : undefined));
  const reason = item.reasons.find((r) => EXPLAINING.has(r.code));
  const unread = item.unreadCount > 0;
  const title = listTitle(item);
  const preview = typing
    ? 'typing…'
    : item.draft
      ? tr('Draft: {draft}', { draft: item.draft })
      : item.lastMessage
        ? `${item.lastMessage.mine ? 'You: ' : ''}${item.lastMessage.preview}`
        : item.request === 'incoming'
          ? tr('Wants to message you')
          : tr('Say hello');
  const previewColor = typing
    ? 'accentStrong'
    : item.draft
      ? 'accentStrong'
      : unread
        ? 'text'
        : 'textSecondary';
  const label = [
    title,
    item.relationship?.label,
    reason?.label,
    unread ? `${item.unreadCount} unread` : null,
    preview,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      delayLongPress={350}
      focusRadius={12}
      testID={`conversation-${item.id}`}
    >
      {({ hovered, pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 6,
            borderRadius: 14,
            backgroundColor: selected
              ? t.c.surfacePressed
              : pressed
                ? t.c.surfacePressed
                : hovered
                  ? t.c.surfaceHover
                  : 'transparent',
          }}
        >
          {item.org ? (
            <OrgMark kind={item.org.kind} url={item.org.avatarUrl} size={52} />
          ) : item.kind === 'direct' && item.other ? (
            <Avatar
              id={item.other.id}
              name={item.other.displayName}
              url={item.other.avatarUrl}
              size={52}
              presence={presence ?? item.other.presence}
            />
          ) : (
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                backgroundColor: t.c.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={24} color={t.c.textSecondary} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text
                variant={unread ? 'label' : 'bodyStrong'}
                numberOfLines={1}
                style={{ flexShrink: 1 }}
                auto
              >
                {title}
              </Text>
              {item.pinned ? <Pin size={13} color={t.c.textTertiary} /> : null}
              {item.muted ? <BellOff size={13} color={t.c.textTertiary} /> : null}
              <View style={{ flex: 1 }} />
              <Text
                variant="caption"
                color={unread ? 'accentStrong' : 'textTertiary'}
                weight={unread ? 600 : 500}
              >
                {formatListTime(
                  item.lastMessage?.createdAt ?? item.lastActivityAt,
                  now,
                  timeZone,
                  locale,
                )}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="body" color={previewColor} numberOfLines={1} style={{ flex: 1 }} auto>
                {item.kind === 'group' && !item.lastMessage
                  ? joinNames([trn(item.memberCount, '{n} person', '{n} people')])
                  : preview}
              </Text>
              <Badge
                count={item.unreadCount}
                muted={item.muted}
                mention={item.unreadMentions > 0}
              />
            </View>
            {item.relationship || reason || item.org ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
              >
                {item.org ? (
                  // Business is visibly business (R15), and says whether that's proven.
                  <Chip
                    size="sm"
                    label={item.org.verified ? tr('Verified business') : tr('Business')}
                    icon={item.org.verified ? BadgeCheck : Briefcase}
                    tone={item.org.verified ? 'success' : 'neutral'}
                  />
                ) : null}
                {item.relationship ? (
                  <RelationshipChip
                    label={item.relationship.label}
                    sphere={item.relationship.sphere}
                  />
                ) : null}
                {reason ? (
                  <Text
                    variant="caption"
                    color={
                      reason.code === 'overdue' || reason.code === 'request_to_you'
                        ? 'warning'
                        : 'textSecondary'
                    }
                    weight={600}
                    numberOfLines={1}
                  >
                    {reason.label}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
});
