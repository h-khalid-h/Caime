/**
 * What a clinic's lawyer needs (R54): the organization is the controller of its customers'
 * conversations. Its owner and admins export them; its owner sets how long they're kept; a
 * customer's is erased at their request from its thread in the inbox; and who processes data
 * for Caime is on the privacy page, from the one list in the code.
 */
import type { OrgView } from '@caime/core/api';
import { retentionText } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { Choice } from '@/features/settings/SettingsPage';
import { isWeb, WEB_URL } from '@/lib/config';
import { openLink } from '@/lib/links';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Download } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const KEEP = ['off', '30', '90', '180', '365', '730'] as const;

export function OrgData({ org, refresh }: { org: OrgView; refresh: (o: OrgView) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const owner = org.myRole === 'owner';
  const current = (
    org.retentionDays === null ? 'off' : String(org.retentionDays)
  ) as (typeof KEEP)[number];

  const exportAll = async () => {
    setBusy(true);
    try {
      const data = await endpoints.orgExport(org.id);
      const text = JSON.stringify(data, null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${org.handle}-caime-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(
        tr('Exported {count} conversations', {
          count: data.conversations.length,
        }),
      );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const keep = async (value: (typeof KEEP)[number]) => {
    setBusy(true);
    try {
      const res = await endpoints.updateOrg(org.id, {
        retentionDays: value === 'off' ? null : Number(value),
      });
      refresh(res.org);
      toast(
        value === 'off'
          ? tr('Conversations stay')
          : tr('Conversations are kept for {retentionText}', {
              retentionText: retentionText(Number(value)),
            }),
      );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="org-data">
      <Card>
        <Text variant="bodyStrong">{tr('Your customers’ data')}</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
          {tr(
            'Conversations with your customers are {name}’s to answer for; Caime keeps them for you. Export them, choose how long they’re kept, and erase a customer’s at their request from its thread in the inbox (More → Erase).',
            { name: org.name },
          )}
        </Text>
        {isWeb ? (
          <Button
            label={tr('Export the conversations')}
            icon={Download}
            size="sm"
            variant="secondary"
            loading={busy}
            onPress={() => void exportAll()}
            testID="org-export"
          />
        ) : (
          <Text variant="caption" color="textTertiary">
            {tr('Export from a computer: it downloads a file.')}
          </Text>
        )}
        <View style={{ height: 1, backgroundColor: t.c.border, marginVertical: 12 }} />
        {owner ? (
          <View testID="org-retention">
            <Choice
              label={tr('Keep conversations for')}
              value={KEEP.includes(current) ? current : 'off'}
              onChange={(v) => void keep(v)}
              options={KEEP.map((v) =>
                v === 'off'
                  ? {
                      value: v,
                      label: tr('As long as the account exists'),
                      detail: tr('Unless a conversation’s own disappearing setting says otherwise'),
                    }
                  : { value: v, label: retentionText(Number(v)) },
              )}
            />
          </View>
        ) : (
          <Text variant="caption" color="textSecondary">
            {org.retentionDays
              ? tr('Conversations are kept for {retentionText}; the owner sets it.', {
                  retentionText: retentionText(org.retentionDays),
                })
              : tr('Conversations are kept as long as the account exists; the owner sets it.')}
          </Text>
        )}
        <Text variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
          {tr(
            'Each message goes when its time is up, as a disappearing message does, and customers see how long you keep theirs.',
          )}
        </Text>
        <Button
          label={tr('Who processes data for Caime')}
          size="sm"
          variant="ghost"
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onPress={() => openLink(`${WEB_URL}/privacy`)}
          testID="org-processors"
        />
      </Card>
    </View>
  );
}
