/**
 * What a suspended account sees on signing in (M16 B6): why, an appeal, and a copy of its data,
 * all through the claim the refusal handed over (thirty minutes; no session is ever made). Loaded
 * only when a sign-in is refused this way.
 */
import type { SuspendedDetails } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { isWeb } from '@/lib/config';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export function Suspended({ reason, claim }: SuspendedDetails) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<'sent' | 'open' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const appeal = async () => {
    if (!claim || text.trim().length < 10) {
      setProblem(tr('Say in a few words why you think it’s wrong.'));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const res = await endpoints.appealSuspension({ claim, text: text.trim() });
      setSent(res.already ? 'open' : 'sent');
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!claim) return;
    setBusy(true);
    setProblem(null);
    try {
      const data = await endpoints.suspendedExport(claim);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `caime-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }} testID="suspended">
      <Text variant="bodyStrong" color="danger">
        {tr('This account is suspended.')}
      </Text>
      <Text variant="body" color="textSecondary" testID="suspended-reason">
        {reason ? tr('Why: {reason}', { reason }) : tr('No reason was recorded.')}
      </Text>
      {claim ? (
        sent ? (
          <Text variant="body" accessibilityLiveRegion="polite" testID="suspended-appealed">
            {sent === 'sent'
              ? tr('Your appeal is with Caime. You’ll hear back by email.')
              : tr('Your appeal is already with Caime. You’ll hear back by email.')}
          </Text>
        ) : (
          <>
            <TextField
              label={tr('Why it’s wrong')}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              testID="suspended-appeal-text"
            />
            <Button
              label={tr('Send appeal')}
              loading={busy}
              onPress={appeal}
              testID="suspended-appeal"
            />
          </>
        )
      ) : null}
      {claim ? (
        <Button
          label={tr('Download your data')}
          variant="secondary"
          disabled={busy || !isWeb}
          onPress={download}
          testID="suspended-export"
        />
      ) : null}
      {claim && !isWeb ? (
        <Text variant="caption" color="textSecondary">
          {tr('Open Caime on the web to download it')}
        </Text>
      ) : null}
      {problem ? (
        <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}
