import { tr } from '@caime/core/i18n';
import KeyRound from 'lucide-react-native/icons/key-round';
import { useState } from 'react';
import { View } from 'react-native';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { Text } from '@/ui/Text';

/** The codes and the password form, loaded the first time the card is opened (the budget). */
const RecoveryCodesSheet = lazyPart(() =>
  import('./RecoveryCodesSheet').then((m) => m.RecoveryCodesSheet),
);

/**
 * Recovery codes at the first quiet moment (R56): sign-up no longer stops for them. The ten
 * codes made at sign-up wait on this device, and this card sits at the top of Chats until the
 * person says they're saved, which the account remembers so no device asks again. Gone before
 * they were saved (a reload on the web), it makes new ones, the password saying it's them.
 */
export function RecoveryCodesCard() {
  const t = useTheme();
  const me = useMe();
  const fresh = useSession((s) => s.freshRecoveryCodes);
  const [open, setOpen] = useState(false);
  const opened = useOpened(open);
  if (me.recoveryCodesSeen) return null;

  return (
    <>
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 14,
          gap: 10,
          borderRadius: 16,
          backgroundColor: t.c.surfaceMuted,
        }}
        testID="codes-card"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KeyRound size={18} color={t.c.textSecondary} strokeWidth={2.2} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {tr('Keep your recovery codes')}
          </Text>
        </View>
        <Text variant="caption" color="textSecondary">
          {tr(
            'If you ever forget your password, they get you back in. Caime never asks for your phone number.',
          )}
        </Text>
        <Button
          label={fresh ? tr('Show the codes') : tr('Make the codes')}
          size="sm"
          onPress={() => setOpen(true)}
          testID="codes-show"
        />
      </View>
      {opened ? (
        <RecoveryCodesSheet
          open={open}
          onClose={() => setOpen(false)}
          fresh={fresh}
          onDone={(user) => {
            useSession.getState().setUser(user);
            useSession.getState().clearRecoveryCodes();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
