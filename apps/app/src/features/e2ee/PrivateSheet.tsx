import type { ConversationView } from '@caishy/core/api';
import { View } from 'react-native';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Lock, ShieldCheck } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { acceptCode, type PersonCode, privateSupported, useCodes } from './private';

/** Someone's name in this conversation, as it shows them. */
const nameIn = (conversation: ConversationView, userId: string) =>
  conversation.participants.find((p) => p.userId === userId)?.person.displayName ?? 'Someone';

/**
 * What a private conversation is, said plainly (R18: what it costs, never weakened silently),
 * and each person's security code, to compare with them.
 */
export function PrivateSheet({
  conversation,
  open,
  onClose,
}: {
  conversation: ConversationView;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const me = useSession((s) => s.user?.id ?? '');
  const codes = useCodes(open ? conversation.id : null);
  const mine = codes?.find((c) => c.userId === me);
  const others = (codes ?? []).filter((c) => c.userId !== me);
  const missing = conversation.participants.filter(
    (p) => p.userId !== me && !codes?.some((c) => c.userId === p.userId),
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Private conversation"
      subtitle="End to end encrypted"
    >
      <View style={{ gap: 14, paddingBottom: 8 }} testID="private-sheet">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Lock size={18} color={t.c.success} />
          <Text variant="body" style={{ flex: 1 }}>
            Only the devices of the people in it can read what’s written here. Caishy can’t: it
            keeps each message sealed, and never sees the words.
          </Text>
        </View>
        <Text variant="caption" color="textSecondary">
          So there’s no search, no Caishy AI and no suggestions from what’s written here, and
          notifications say only “New message”. Caishy still sees who’s in it, when messages are
          sent, and reactions. A device you sign in on later can’t read what was sent before it.
          Photos, files and cards aren’t sealed yet, so for now it’s text.
        </Text>
        {!privateSupported ? (
          <Text variant="captionStrong">Private conversations open in Caishy on the web.</Text>
        ) : null}
        {others.map((c) => (
          <CodeCard key={c.userId} name={nameIn(conversation, c.userId)} code={c} />
        ))}
        {missing.map((p) => (
          <Text key={p.userId} variant="caption" color="textSecondary">
            {p.person.displayName} hasn’t opened a private conversation on any device yet, so
            nothing here is sealed for them until they do.
          </Text>
        ))}
        {mine?.code ? (
          <Card>
            <View style={{ gap: 4 }}>
              <Text variant="label">Your security code</Text>
              <Text
                variant="title"
                style={{ letterSpacing: 1 }}
                selectable
                testID="private-my-code"
              >
                {mine.code}
              </Text>
              <Text variant="caption" color="textSecondary">
                It changes when you sign in on another device, or sign out of one.
              </Text>
            </View>
          </Card>
        ) : null}
      </View>
    </Sheet>
  );
}

function CodeCard({ name, code }: { name: string; code: PersonCode }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ gap: 6 }} testID="private-code">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {code.verified ? <ShieldCheck size={16} color={t.c.success} /> : null}
          <Text variant="label" style={{ flex: 1 }}>
            {name}’s security code
          </Text>
        </View>
        <Text variant="title" style={{ letterSpacing: 1 }} selectable>
          {code.code}
        </Text>
        <Text variant="caption" color={code.changed ? 'warning' : 'textSecondary'}>
          {code.changed
            ? `It changed: ${name} signed in on another device, or out of one. Compare it with them to be sure it’s them.`
            : code.verified
              ? `You compared it with ${name}.`
              : `Compare it with ${name} (in person, or on a call): if it matches the code ${name} sees as theirs, it’s them.`}
        </Text>
        {code.code && (code.changed || !code.verified) ? (
          <Button
            label={code.changed ? 'It’s them: remember this code' : 'It matches'}
            size="sm"
            variant="secondary"
            onPress={() => void acceptCode(code.userId, code.code ?? '', true)}
            testID="private-code-accept"
          />
        ) : null}
      </View>
    </Card>
  );
}

/** Said in the conversation when someone's code changed since this device last saw it. */
export function CodeChangedBanner({
  conversation,
  onOpen,
}: {
  conversation: ConversationView;
  onOpen: () => void;
}) {
  const t = useTheme();
  const me = useSession((s) => s.user?.id ?? '');
  const codes = useCodes(conversation.privacyClass === 'private' ? conversation.id : null);
  const changed = (codes ?? []).filter((c) => c.userId !== me && c.changed);
  if (!changed.length) return null;
  const names = changed.map((c) => nameIn(conversation, c.userId).split(' ')[0]).join(' and ');
  return (
    <View
      testID="private-code-changed"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: t.c.warningSoft,
      }}
    >
      <Lock size={16} color={t.c.warning} />
      <Text variant="caption" style={{ flex: 1 }}>
        {names}’s security code changed.
      </Text>
      <Button label="View" size="sm" variant="secondary" onPress={onOpen} />
    </View>
  );
}
