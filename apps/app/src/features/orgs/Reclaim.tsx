/**
 * Taking a closed organization back (R42): its handle is waiting for whoever proves its domain
 * again. Offered where someone asks for that handle, with the record to add and "Check now"; the
 * organization then continues under the same handle and page, with this person as its owner.
 */
import type { ClosedOrgView, OrgReclaimView } from '@caime/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export function ReclaimCard({ closed }: { closed: ClosedOrgView }) {
  const qc = useQueryClient();
  const [started, setStarted] = useState<OrgReclaimView | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ gap: 8 }} testID="org-reclaim">
        <Text variant="bodyStrong">{closed.name} closed, and its handle is waiting for it</Text>
        <Text variant="caption" color="textSecondary">
          {started
            ? `At ${closed.domain}’s DNS provider, add a TXT record with this name and value, then check. Changes can take a few minutes to appear.`
            : `If you’re ${closed.name}, prove you control ${closed.domain} again and it continues: the same handle and page, with you as its owner. Its old team, apps and followers don’t come back; what its customers were sent stays theirs to read.`}
        </Text>
        {started ? (
          <View style={{ gap: 10 }}>
            <CopyRow label="Name" value={started.record.name} testID="org-reclaim-name" />
            <CopyRow label="Value" value={started.record.value} testID="org-reclaim-value" />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {started ? (
            <Button
              label="Check now"
              size="sm"
              loading={busy}
              testID="org-reclaim-check"
              onPress={() =>
                void run(async () => {
                  const { org } = await endpoints.checkReclaim(closed.id);
                  qc.setQueryData(qk.org(org.handle), { org });
                  void qc.invalidateQueries({ queryKey: qk.orgs });
                  toast(`${org.name} is yours again`);
                  router.replace({ pathname: '/o/[handle]', params: { handle: org.handle } });
                })
              }
            />
          ) : (
            <Button
              label="Take it back"
              size="sm"
              variant="secondary"
              loading={busy}
              testID="org-reclaim-start"
              onPress={() =>
                void run(async () => setStarted(await endpoints.reclaimOrg(closed.id)))
              }
            />
          )}
        </View>
      </View>
    </Card>
  );
}
