/**
 * Inviting someone to a meeting (R84), loaded when asked for: by their address, when they get a
 * calendar invitation with their own link, or by a link to send yourself (review 2026-10-17 §1
 * H6), shown once, for someone you'd rather reach on WhatsApp or where Caime can't send mail.
 * Either way they join as a guest without an account and see the meeting's own space alone;
 * someone already on Caime is asked, as any request is. The meeting moves to that space, which
 * this opens.
 */
import { tr } from '@caime/core/i18n';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import Link from 'lucide-react-native/icons/link';
import Share from 'lucide-react-native/icons/share';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { shareLink } from '@/lib/share';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
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
  // A guest by link: their link, shown once, and where the meeting moved.
  const [made, setMade] = useState<{ link: string; name: string; space: string } | null>(null);
  const openSpace = (id: string) => router.push({ pathname: '/c/[id]', params: { id } });
  const invite = useMutation({
    mutationFn: () =>
      endpoints.inviteGuest(messageId, { email: email.trim(), name: name.trim() || null }),
    onSuccess: ({ space }) => {
      toast(tr('Invitation sent to {email}', { email: email.trim() }));
      setEmail('');
      setName('');
      onClose();
      openSpace(space.conversationId);
    },
  });
  const byLink = useMutation({
    mutationFn: () => endpoints.inviteGuest(messageId, { link: true, name: name.trim() }),
    onSuccess: ({ space, link }) => {
      if (link) setMade({ link, name: name.trim(), space: space.conversationId });
    },
  });
  const close = () => {
    const space = made?.space;
    setMade(null);
    setEmail('');
    setName('');
    onClose();
    if (space) openSpace(space);
  };
  const error = (invite.error ?? byLink.error) as Error | null;
  return (
    <Sheet
      open={open}
      onClose={close}
      title={made ? tr('Their link') : tr('Invite a guest')}
      subtitle={
        made
          ? tr(
              'Send it to {name} yourself, on WhatsApp or anywhere: it opens this meeting alone, without an account. It’s shown this once.',
              { name: made.name },
            )
          : tr(
              'They join without an account and see this meeting’s own space, nothing else. By email, they get a calendar invitation with their link; or make a link to send yourself.',
            )
      }
      footer={
        made ? (
          <Button label={tr('Done')} block size="lg" onPress={close} testID="guest-link-done" />
        ) : (
          <Button
            label={tr('Send the invitation')}
            block
            size="lg"
            loading={invite.isPending}
            disabled={!email.trim()}
            onPress={() => invite.mutate()}
            testID="guest-send"
          />
        )
      }
    >
      {made ? (
        <View style={{ gap: 12 }} testID="guest-link-made">
          <CopyRow label={tr('Link')} value={made.link} testID="guest-link" />
          <View style={{ flexDirection: 'row' }}>
            <Button
              label={tr('Share')}
              icon={Share}
              size="sm"
              variant="secondary"
              onPress={() =>
                void shareLink(
                  title
                    ? tr('Join “{title}” on Caime:', { title })
                    : tr('Join the meeting on Caime:'),
                  made.link,
                )
              }
              testID="guest-link-share"
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {title ? (
            <Text variant="bodyStrong" auto>
              {title}
            </Text>
          ) : null}
          <TextField
            label={tr('Their name')}
            hint={tr('As the invitation greets them; they can change it.')}
            value={name}
            onChangeText={setName}
            maxLength={80}
            testID="guest-name"
          />
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
          <View style={{ flexDirection: 'row' }}>
            <Button
              label={tr('Make a link instead')}
              icon={Link}
              size="sm"
              variant="secondary"
              loading={byLink.isPending}
              disabled={!name.trim()}
              onPress={() => byLink.mutate()}
              testID="guest-make-link"
            />
          </View>
          {error ? (
            <Text color="danger" testID="guest-error">
              {error.message}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
