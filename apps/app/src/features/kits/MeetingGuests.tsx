/**
 * A meeting card's guests (R83, R84): an accepted meeting held on Caime invites someone by their
 * address, and its first guest gives it a space of its own; the card it came from then says it
 * moved, and opens the space. Who may invite is the server's to decide (an adult, never in a
 * private or business conversation, up to eight); this offers it where it can be.
 */
import { tr } from '@caime/core/i18n';
import { meetingVenue } from '@caime/core/meetings';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { Text } from '@/ui/Text';

const InviteGuestSheet = lazyPart(() =>
  import('./InviteGuestSheet').then((m) => m.InviteGuestSheet),
);

export interface MeetingCardPayload {
  state?: string;
  title?: string;
  fields?: Record<string, unknown> | null;
  movedTo?: { conversationId: string; messageId: string } | null;
}

export function MeetingGuests({
  messageId,
  card,
  deleted,
  where,
}: {
  messageId: string;
  card: MeetingCardPayload;
  deleted: boolean;
  /** Whether this conversation may have guests: a person's own, never private or a business's. */
  where: boolean;
}) {
  const minor = useSession((s) => s.user?.minor ?? true);
  const [inviting, setInviting] = useState(false);
  const [opened, setOpened] = useState(false);
  if (deleted || card.state !== 'accepted') return null;
  if (card.movedTo) {
    const to = card.movedTo.conversationId;
    return (
      <View style={{ gap: 6 }} testID="kit-moved">
        <Text variant="caption" color="textSecondary">
          {tr('Moved to its own space, with its guests.')}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Button
            label={tr('Open')}
            size="sm"
            variant="secondary"
            onPress={() => router.push({ pathname: '/c/[id]', params: { id: to } })}
            testID="kit-moved-open"
          />
        </View>
      </View>
    );
  }
  if (!where || minor || meetingVenue(card.fields?.place) !== 'caime') return null;
  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <Button
          label={tr('Invite by email')}
          size="sm"
          variant="ghost"
          onPress={() => {
            setOpened(true);
            setInviting(true);
          }}
          testID="kit-invite"
        />
      </View>
      {opened ? (
        <InviteGuestSheet
          open={inviting}
          messageId={messageId}
          title={card.title ?? ''}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </>
  );
}
