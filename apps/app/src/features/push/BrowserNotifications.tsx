/** Settings → Notifications: whether this browser shows calls and messages when Caishy isn't open. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { disableWebPush, enableWebPush, type PushState, pushState, webPushOn } from './webPush';

export function BrowserNotifications() {
  const [state, setState] = useState<PushState>(() => pushState());
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether this browser is subscribed, looked at again whenever what the browser allows changes.
  useEffect(() => {
    if (state === 'granted') void webPushOn().then(setOn);
    else setOn(false);
  }, [state]);
  if (state === 'unsupported') return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      const answer = await enableWebPush();
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
    await disableWebPush();
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
            ? 'This browser blocks notifications from Caishy. Allow them in its site settings, then come back.'
            : on
              ? 'On: calls and messages reach you here when Caishy isn’t open.'
              : 'Hear calls and messages here when Caishy isn’t open.'}
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
