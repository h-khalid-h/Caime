/**
 * Verify the domain (PRD §55): one TXT record, then "Check now". Shown on the organization's
 * setup screen (R57) to its owner and admins.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export function OrgVerification({ org, refresh }: { org: OrgView; refresh: (o: OrgView) => void }) {
  const t = useTheme();
  const [domain, setDomain] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<'set' | 'check' | null>(null);
  const run = async (
    kind: 'set' | 'check',
    work: () => Promise<{ org: OrgView }>,
    done?: string,
  ) => {
    setBusy(kind);
    try {
      const r = await work();
      refresh(r.org);
      if (done) toast(done);
      setChanging(false);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const d = org.domain;
  if (d?.verified && !changing)
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BadgeCheck size={18} color={t.c.success} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {tr('{name} is verified', { name: d.name })}
          </Text>
          <Button
            label={tr('Change')}
            size="sm"
            variant="ghost"
            onPress={() => setChanging(true)}
          />
        </View>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
          {tr('Your team shows as “Verified at {name}”. Keep the TXT record in place.', {
            name: org.name,
          })}
        </Text>
      </Card>
    );
  if (!d || changing)
    return (
      <Card>
        <Text variant="bodyStrong">{tr('Verify your domain')}</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
          {tr(
            'Prove {name} controls its website’s domain with one DNS record. Then your team shows as verified, and customers know it’s really you.',
            { name: org.name },
          )}
        </Text>
        <TextField
          label={tr('Your domain')}
          value={domain}
          onChangeText={setDomain}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="datac.com"
          testID="org-domain"
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button
            label={tr('Get the record')}
            loading={busy === 'set'}
            testID="org-domain-set"
            onPress={() =>
              void (domain.trim()
                ? run('set', () => endpoints.setOrgDomain(org.id, domain.trim()))
                : toast(tr('Enter your domain, like datac.com.')))
            }
          />
          {changing ? (
            <Button
              label={tr('Keep the current one')}
              variant="ghost"
              onPress={() => setChanging(false)}
            />
          ) : null}
        </View>
      </Card>
    );
  return (
    <Card>
      <Text variant="bodyStrong">{tr('Add this record to {name}', { name: d.name })}</Text>
      <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
        {tr(
          'At your domain’s DNS provider, add a TXT record with this name and value, then check. Changes can take a few minutes to appear.',
        )}
      </Text>
      <View style={{ gap: 10 }}>
        <CopyRow label={tr('Name')} value={d.record.name} testID="org-record-name" />
        <CopyRow label={tr('Value')} value={d.record.value} testID="org-record-value" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button
          label={tr('Check now')}
          loading={busy === 'check'}
          testID="org-domain-check"
          onPress={() =>
            void run(
              'check',
              () => endpoints.checkOrgDomain(org.id),
              tr('{name} is verified', { name: d.name }),
            )
          }
        />
        <Button
          label={tr('Use another domain')}
          variant="ghost"
          onPress={() => setChanging(true)}
        />
      </View>
    </Card>
  );
}
