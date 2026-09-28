/** Settings → Notifications: whether this browser shows calls and messages when Caime isn't open. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { type PushState, pushState } from './support';

/** The rest loads when it's needed: nothing of it is in the first download. */
const push = () => import('./webPush');

export function BrowserNotifications() {
  const [state, setState] = useState<PushState>(() => pushState());
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether this browser is subscribed, looked at again whenever what the browser allows changes.
  useEffect(() => {
    if (state === 'granted')
      void push()
        .then((p) => p.webPushOn())
        .then(setOn);
    else setOn(false);
  }, [state]);
  if (state === 'unsupported') return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      const answer = await (await push()).enableWebPush();
      setState(answer);
      setOn(answer === 'granted');
      if (answer === 'granted') toast('Notifications are on in this browser');
    } catch (e) {
      toast((e as Error).message || 'This browser couldn’t turn them on.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await (await push()).disableWebPush();
    setOn(false);
    setBusy(false);
    toast('Notifications are off in this browser');
  };
  return (
    <Group
      title="In this browser"
      footer="Only while you're signed in here. What each notification says follows your rules below."
    >
      <View style={{ padding: 16, gap: 10 }} testID="browser-notifications">
        <Text variant="body">
          {state === 'denied'
            ? 'This browser blocks notifications from Caime. Allow them in its site settings, then come back.'
            : on
              ? 'On: calls and messages reach you here when Caime isn’t open.'
              : 'Hear calls and messages here when Caime isn’t open.'}
        </Text>
        {state === 'denied' ? null : on ? (
          <Button
            label="Turn off"
            variant="secondary"
            size="sm"
            loading={busy}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => void turnOff()}
            testID="browser-notifications-off"
          />
        ) : (
          <Button
            label="Turn on"
            size="sm"
            loading={busy}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => void turnOn()}
            testID="browser-notifications-on"
          />
        )}
      </View>
    </Group>
  );
}
