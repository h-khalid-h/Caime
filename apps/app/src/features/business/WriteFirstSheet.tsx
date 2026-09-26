import type { OrgView } from '@caishy/core/api';
import { uuidv4 } from '@caishy/core/ids';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { AtSign } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/**
 * Someone on the team writes to a person first (R14). It reaches them as a message request from
 * the organization, and the team writes again once they answer. Only a verified organization
 * writes first; until then, the sheet says how to become one.
 */
export function WriteFirstSheet({
  org,
  open,
  onClose,
}: {
  org: OrgView;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const [handle, setHandle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // One id per message written, so a retried tap never sends it twice (ADR-8).
  const clientId = useRef(uuidv4());

  const close = () => {
    setError(null);
    onClose();
  };
  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const { conversationId } = await endpoints.startThread(org.id, {
        handle: handle.trim(),
        body: body.trim(),
        clientId: clientId.current,
      });
      clientId.current = uuidv4();
      setHandle('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['org-inbox', org.id] });
      void qc.invalidateQueries({ queryKey: qk.businessSummary });
      onClose();
      if (desktop)
        router.navigate({
          pathname: '/c/[id]',
          params: { id: conversationId, inbox: org.handle },
        });
      else router.push({ pathname: '/c/[id]', params: { id: conversationId } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!org.verified)
    return (
      <Sheet open={open} onClose={close} title="Write to someone">
        <Text variant="body" color="textSecondary">
          {`Only a verified organization writes to someone first, so nobody can pose as one. Verify ${org.name}’s domain on its page, and anyone on the team can.`}
        </Text>
        <Button
          label="Verify the domain"
          variant="secondary"
          onPress={() => {
            close();
            router.push({ pathname: '/o/[handle]', params: { handle: org.handle } });
          }}
        />
      </Sheet>
    );

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Write to someone"
      subtitle={`As ${org.name}`}
      footer={
        <Button
          label="Send"
          onPress={() => void send()}
          loading={sending}
          disabled={!handle.trim() || !body.trim()}
          testID="write-first-send"
        />
      }
    >
      <TextField
        label="Their handle"
        value={handle}
        onChangeText={setHandle}
        placeholder="@handle"
        icon={AtSign}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        testID="write-first-handle"
      />
      <TextField
        label="Message"
        value={body}
        onChangeText={setBody}
        placeholder={`Hello, this is ${org.name}…`}
        multiline
        maxLength={4000}
        error={error}
        testID="write-first-body"
      />
      <View style={{ gap: 4 }}>
        <Text variant="caption" color="textSecondary">
          {`If they haven’t written to ${org.name} before, it reaches them as a message request: nothing more from the team until they answer, and they can decline or block ${org.name}.`}
        </Text>
        <Text variant="caption" color="textTertiary">
          Never to anyone under 18, or who only takes messages from people they know.
        </Text>
      </View>
    </Sheet>
  );
}
