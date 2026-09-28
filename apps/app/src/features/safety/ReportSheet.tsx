/**
 * Reporting a person, a message, an organization or one of its updates: what's wrong, chosen
 * from what Caime's safety team acts on, and anything else they should know. Opened from
 * anywhere with `report(target, name)` (report.ts); one sheet, loaded the first time it's asked
 * for.
 */
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
  { value: 'spam', label: 'Spam', detail: 'Ads, or the same message again and again' },
  { value: 'scam', label: 'A scam', detail: 'Asking for money, a password or a code' },
  { value: 'harassment', label: 'Harassment or bullying', detail: 'Threats, insults, hounding' },
  {
    value: 'impersonation',
    label: 'Pretending to be someone',
    detail: 'A person or organization they aren’t',
  },
  { value: 'inappropriate', label: 'Inappropriate', detail: 'Violence, sexual content, hate' },
  { value: 'other', label: 'Something else', detail: 'Say what below' },
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
      toast('Reported. Thank you for keeping Caime safe.');
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
      title={`Report ${name}`}
      subtitle="Caime’s safety team reads every report. Nobody is told who made it."
      footer={
        <Button
          label="Send report"
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
        <Group title="What’s wrong">
          <Choice<Reason>
            label="What’s wrong"
            value={reason ?? ('' as Reason)}
            onChange={setReason}
            options={REASONS}
          />
        </Group>
        <TextField
          label={reason === 'other' ? 'What happened' : 'Anything else they should know (optional)'}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={2000}
          testID="report-details"
        />
        {reason === 'other' && !details.trim() ? (
          <Text variant="caption" color="textTertiary">
            Say what happened, so the team knows what to look at.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
