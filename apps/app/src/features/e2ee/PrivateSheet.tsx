import type { ConversationView } from '@caishy/core/api';
import { useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CircleAlert, Lock, ShieldCheck } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { useCodes, useMyDevices } from './codes';
import { loadPrivate } from './hooks';
import type { PersonCode } from './private';
import { privateSupported } from './support';

/** Someone's name in this conversation, as it shows them. */
const nameIn = (conversation: ConversationView, userId: string) =>
  conversation.participants.find((p) => p.userId === userId)?.person.displayName ?? 'Someone';

/**
 * What a private conversation is, said plainly (R18: what it costs, never weakened silently),
 * each person's security code, to compare with them, and any device of mine waiting for me to
 * say it's mine.
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
          sent, and reactions. A device you sign in on later reads what’s sent once you approve it
          from one of yours, never what was sent before. Photos, files and cards aren’t sealed yet,
          so for now it’s text.
        </Text>
        {!privateSupported ? (
          <Text variant="captionStrong">Private conversations open in Caishy on the web.</Text>
        ) : null}
        <WaitingDevices on={open && privateSupported} />
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
                It stays the same as you add devices (each one you approve). It changes only if you
                start over.
              </Text>
              {mine.unconfirmed ? (
                <Text variant="caption" color="danger" testID="private-my-unconfirmed">
                  Caishy lists a device as yours that none of yours approved. Nothing is sealed for
                  it. If you didn’t sign in somewhere new, remove it in Settings, Security.
                </Text>
              ) : null}
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
          {code.held
            ? `It changed since you compared it: ${name} started over on a device, or someone is posing as them. Nothing is sealed for ${name}, nor shown from them, until you compare it again.`
            : code.changed
              ? `It changed: ${name} started over on a device. Compare it with them to be sure it’s them.`
              : code.verified
                ? `You compared it with ${name}.`
                : `Compare it with ${name} (in person, or on a call): if it matches the code ${name} sees as theirs, it’s them.`}
        </Text>
        {code.unconfirmed ? (
          <Text variant="caption" color="warning" testID="private-code-unconfirmed">
            {`Caishy lists a device for ${name} that none of theirs approved. Nothing is sealed for it.`}
          </Text>
        ) : null}
        {code.code && (code.changed || !code.verified) ? (
          <Button
            label={code.changed ? 'It’s them: remember this code' : 'It matches'}
            size="sm"
            variant="secondary"
            onPress={() =>
              void loadPrivate().then((p) =>
                p.acceptCode(code.userId, code.code ?? '', true, code.rootId),
              )
            }
            testID="private-code-accept"
          />
        ) : null}
      </View>
    </Card>
  );
}

/** A device of mine waiting for me to say it's mine: approved from here, or signed out. */
export function WaitingDevices({ on }: { on: boolean }) {
  const devices = useMyDevices(on);
  const waiting = (devices ?? []).filter((d) => !d.approved && !d.current);
  if (!waiting.length) return null;
  const act = (f: (p: typeof import('./private')) => Promise<void>, done: string) =>
    void loadPrivate()
      .then(f)
      .then(() => toast(done))
      .catch((e) => toast((e as Error).message, { tone: 'danger' }));
  return (
    <View style={{ gap: 10 }}>
      {waiting.map((d) => (
        <Card key={d.id}>
          <View style={{ gap: 8 }} testID="private-waiting">
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <CircleAlert size={16} />
              <Text variant="label" style={{ flex: 1 }}>
                {`Is this you? ${d.name ?? 'A new device'}`}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              It signed in to your account and wants to read your private conversations. Approve it
              only if you just signed in there yourself.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label="It’s me: approve"
                size="sm"
                onPress={() => act((p) => p.approveDevice(d.id), 'Approved.')}
                testID="private-approve"
              />
              <Button
                label="Not me: sign it out"
                size="sm"
                variant="secondary"
                onPress={() => act((p) => p.removeDevice(d.id), 'Signed out.')}
                testID="private-deny"
              />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

/**
 * Start over on this device: it reads private conversations from now on, and every other device
 * of mine stops. Everyone who compared my code sees it changed.
 */
export function StartOverSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Start over here?">
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <Text variant="body">
          This browser reads your private conversations from now on, and every other device of yours
          stops reading them until you approve it from here.
        </Text>
        <Text variant="caption" color="textSecondary">
          Your security code changes, so the people you write to privately see it did. Nothing sent
          before now opens here. If another device of yours is at hand, approve this one from it
          instead.
        </Text>
        <Button
          label="Start over here"
          variant="danger"
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void loadPrivate()
              .then((p) => p.startOver())
              .then(() => onClose())
              .catch((e) => toast((e as Error).message, { tone: 'danger' }))
              .finally(() => setBusy(false));
          }}
          testID="private-start-over-confirm"
        />
      </View>
    </Sheet>
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
  const changed = (codes ?? []).filter((c) => c.userId !== me && (c.changed || c.unconfirmed));
  const alarm = (codes ?? []).some((c) => c.userId === me && c.unconfirmed);
  if (!changed.length && !alarm) return null;
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
        backgroundColor: alarm ? t.c.dangerSoft : t.c.warningSoft,
      }}
    >
      <Lock size={16} color={alarm ? t.c.danger : t.c.warning} />
      <Text variant="caption" style={{ flex: 1 }}>
        {alarm
          ? 'A device none of yours approved is listed as yours. Nothing is sealed for it.'
          : `${names}’s security code changed.`}
      </Text>
      <Button label="View" size="sm" variant="secondary" onPress={onOpen} />
    </View>
  );
}

/** A conversation seen as private here, that Caishy now says isn't: said, and nothing sent. */
export function Downgraded() {
  const t = useTheme();
  return (
    <View
      testID="private-downgraded"
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
        backgroundColor: t.c.dangerSoft,
      }}
    >
      <Lock size={16} color={t.c.danger} />
      <Text variant="caption" style={{ flex: 1 }}>
        This conversation was private on this device. Caishy now says it isn’t, so what’s written in
        it isn’t shown or sent as private here.
      </Text>
    </View>
  );
}
