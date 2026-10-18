/**
 * Invitations to a group or a space waiting for this person's answer (M16 B4): someone who runs
 * it asked them in, because they say to be asked first, or because, under 18, they'd be among
 * people they don't know. Only what lets them decide: the place, its kind, how many are in it and
 * who asked. Loaded on Attention only while there is one (the budget).
 */
import type { PlaceInvitationView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import UsersRound from 'lucide-react-native/icons/users-round';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function InvitationsCard({ invitations }: { invitations: PlaceInvitationView[] }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (invitation: PlaceInvitationView, accept: boolean) => {
    setBusy(invitation.id);
    try {
      if (accept) {
        const landed = await endpoints.acceptInvitation(invitation.id);
        if (landed.conversationId)
          router.push({ pathname: '/c/[id]', params: { id: landed.conversationId } });
        else if (landed.spaceId)
          router.push({ pathname: '/s/[id]', params: { id: landed.spaceId } });
      } else {
        await endpoints.declineInvitation(invitation.id);
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: qk.attentionHome });
    }
  };
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8, gap: 8 }} testID="invitations">
      {invitations.map((invitation) => (
        <View
          key={invitation.id}
          accessible={false}
          style={{
            padding: 14,
            gap: 10,
            borderRadius: t.radii.lg,
            backgroundColor: t.c.surfaceMuted,
          }}
          testID={`invitation-${invitation.placeId}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <UsersRound size={18} color={t.c.textSecondary} strokeWidth={2.2} />
            <Text variant="bodyStrong" style={{ flex: 1 }} auto>
              {invitation.by
                ? tr('{name} invited you to “{place}”', {
                    name: invitation.by.displayName,
                    place: invitation.name,
                  })
                : tr('You’re invited to “{place}”', { place: invitation.name })}
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            {invitation.kind === 'group'
              ? trn(invitation.people, 'A group of {n} person', 'A group of {n} people')
              : trn(invitation.people, 'A space of {n} person', 'A space of {n} people')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={tr('Join')}
              size="sm"
              loading={busy === invitation.id}
              disabled={busy !== null}
              onPress={() => void answer(invitation, true)}
              testID="invitation-join"
            />
            <Button
              label={tr('Decline')}
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => void answer(invitation, false)}
              testID="invitation-decline"
            />
          </View>
        </View>
      ))}
    </View>
  );
}
