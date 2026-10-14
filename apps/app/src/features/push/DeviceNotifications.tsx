/**
 * Settings → Notifications: whether this device (a browser, or a phone) shows calls and messages
 * when Caime isn't open, and turning that on or off here.
 */

import { tr } from '@caime/core/i18n';
import { useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { isWeb } from '@/lib/config';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { type PushState, pushState, readPushState } from './support';

/** The rest loads when it's needed: nothing of it is in the first download. */
const push = () => import('./push');

/** The words for where this is: a browser's, or a phone's. */
const words = () =>
  isWeb
    ? {
        title: tr('In this browser'),
        blocked: tr(
          'This browser blocks notifications from Caime. Allow them in its site settings, then come back.',
        ),
        on: tr('On: calls and messages reach you here when Caime isn’t open.'),
        off: tr('Hear calls and messages here when Caime isn’t open.'),
        turnedOn: tr('Notifications are on in this browser'),
        turnedOff: tr('Notifications are off in this browser'),
        failed: tr('This browser couldn’t turn them on.'),
      }
    : {
        title: tr('On this phone'),
        blocked: tr(
          'Your phone blocks notifications from Caime. Allow them in its settings, then come back.',
        ),
        on: tr('On: calls and messages reach this phone when Caime isn’t open.'),
        off: tr('Hear calls and messages on this phone when Caime isn’t open.'),
        turnedOn: tr('Notifications are on for this phone'),
        turnedOff: tr('Notifications are off for this phone'),
        failed: tr('This phone couldn’t turn them on.'),
      };

export function DeviceNotifications() {
  const [state, setState] = useState<PushState>(() => pushState());
  // A browser knows at once; a phone says only when asked, so nothing shows until it has.
  const [known, setKnown] = useState(isWeb);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // What the device allows, read again whenever Caime comes back to the front (from the phone's
  // settings, say).
  useEffect(() => {
    const read = () =>
      void readPushState().then((s) => {
        setState(s);
        setKnown(true);
      });
    read();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') read();
    });
    return () => sub.remove();
  }, []);
  // Whether this device is registered, looked at again whenever what it allows changes.
  useEffect(() => {
    if (state === 'granted')
      void push()
        .then((p) => p.pushOn())
        .then(setOn);
    else setOn(false);
  }, [state]);
  if (!known || state === 'unsupported' || (state === 'granted' && on === null)) return null;
  const w = words();
  const turnOn = async () => {
    setBusy(true);
    try {
      const answer = await (await push()).enablePush();
      setState(answer);
      setOn(answer === 'granted');
      if (answer === 'granted') toast(w.turnedOn);
    } catch (e) {
      toast((e as Error).message || w.failed, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await (await push()).disablePush();
    setOn(false);
    setBusy(false);
    toast(w.turnedOff);
  };
  return (
    <Group
      title={w.title}
      footer={tr(
        "Only while you're signed in here. What each notification says follows your rules below.",
      )}
    >
      <View style={{ padding: 16, gap: 10 }} testID="browser-notifications">
        <Text variant="body">{state === 'denied' ? w.blocked : on ? w.on : w.off}</Text>
        {state === 'denied' ? (
          isWeb ? null : (
            <Button
              label={tr('Open settings')}
              variant="secondary"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => void Linking.openSettings()}
              testID="device-notifications-settings"
            />
          )
        ) : on ? (
          <Button
            label={tr('Turn off')}
            variant="secondary"
            size="sm"
            loading={busy}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => void turnOff()}
            testID="browser-notifications-off"
          />
        ) : (
          <Button
            label={tr('Turn on')}
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
