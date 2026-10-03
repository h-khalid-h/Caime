/**
 * Reporting a person, a message, an organization or one of its updates: what's wrong, chosen
 * from what Caime's safety team acts on, and anything else they should know. Opened from
 * anywhere with `report(target, name)` (report.ts); one sheet, loaded the first time it's asked
 * for.
 */

import { msg, tr, trAll } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { Choice, Group } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { type Reason, useReport } from './report';

const REASONS: Array<{ value: Reason; label: string; detail: string }> = [
  { value: 'spam', label: msg('Spam'), detail: msg('Ads, or the same message again and again') },
  { value: 'scam', label: msg('A scam'), detail: msg('Asking for money, a password or a code') },
  {
    value: 'harassment',
    label: msg('Harassment or bullying'),
    detail: msg('Threats, insults, hounding'),
  },
  {
    value: 'impersonation',
    label: msg('Pretending to be someone'),
    detail: msg('A person or organization they aren’t'),
  },
  {
    value: 'inappropriate',
    label: msg('Inappropriate'),
    detail: msg('Violence, sexual content, hate'),
  },
  { value: 'other', label: msg('Something else'), detail: msg('Say what below') },
];

export function ReportSheet() {
  const { target, name } = useReport();
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    useReport.setState({ target: null, name: '' });
    setReason(null);
    setDetails('');
  };
  const send = async () => {
    if (!target || !reason) return;
    setBusy(true);
    try {
      await endpoints.report({
        ...target,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      close();
      toast(tr('Reported. Thank you for keeping Caime safe.'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={target !== null}
      onClose={close}
      title={tr('Report {name}', { name })}
      subtitle={tr('Caime’s safety team reads every report. Nobody is told who made it.')}
      footer={
        <Button
          label={tr('Send report')}
          size="lg"
          block
          loading={busy}
          disabled={!reason || (reason === 'other' && !details.trim())}
          onPress={() => void send()}
          testID="report-send"
        />
      }
    >
      <View style={{ gap: 14 }}>
        <Group title={tr('What’s wrong')}>
          <Choice<Reason>
            label={tr('What’s wrong')}
            value={reason ?? ('' as Reason)}
            onChange={setReason}
            options={trAll(REASONS)}
          />
        </Group>
        <TextField
          label={
            reason === 'other'
              ? tr('What happened')
              : tr('Anything else they should know (optional)')
          }
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={2000}
          testID="report-details"
        />
        {reason === 'other' && !details.trim() ? (
          <Text variant="caption" color="textTertiary">
            {tr('Say what happened, so the team knows what to look at.')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
