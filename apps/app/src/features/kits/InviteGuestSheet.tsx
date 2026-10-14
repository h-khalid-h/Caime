/**
 * Inviting someone to a meeting by their address (R84), loaded when asked for. They get a
 * calendar invitation with their own link, join as a guest without an account, and see the
 * meeting's own space alone; someone already on Caime is asked, as any request is. The meeting
 * moves to that space, which this opens.
 */
import { tr } from '@caime/core/i18n';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export function InviteGuestSheet({
  open,
  messageId,
  title,
  onClose,
}: {
  open: boolean;
  messageId: string;
  title: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const invite = useMutation({
    mutationFn: () =>
      endpoints.inviteGuest(messageId, { email: email.trim(), name: name.trim() || null }),
    onSuccess: ({ space }) => {
      toast(tr('Invitation sent to {email}', { email: email.trim() }));
      setEmail('');
      setName('');
      onClose();
      router.push({ pathname: '/c/[id]', params: { id: space.conversationId } });
    },
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Invite by email')}
      subtitle={tr(
        'They get a calendar invitation with their own link, and join without an account. The meeting moves to a space of its own, where they see it and nothing else.',
      )}
      footer={
        <Button
          label={tr('Send the invitation')}
          block
          size="lg"
          loading={invite.isPending}
          disabled={!email.trim()}
          onPress={() => invite.mutate()}
          testID="guest-send"
        />
      }
    >
      <View style={{ gap: 12 }}>
        {title ? (
          <Text variant="bodyStrong" auto>
            {title}
          </Text>
        ) : null}
        <TextField
          label={tr('Their email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          testID="guest-email"
        />
        <TextField
          label={tr('Their name')}
          hint={tr('As the invitation greets them; they can change it.')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          testID="guest-name"
        />
        {invite.error ? (
          <Text color="danger" testID="guest-error">
            {(invite.error as Error).message}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
