/**
 * An organization's details, as its owner and admins change them: its name, what it is, where
 * it's based (its defaults: the currency of its cards), the year it began, what it does and its
 * website. Its handle stays: people and links know it by that.
 */

import type { OrgView } from '@caishy/core/api';
import { ORG_KIND_LABELS, ORG_KINDS, type OrgKind } from '@caishy/core/orgs';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { CountryField } from '@/features/geo/CountryField';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { Sheet } from '@/ui/Sheet';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { foundedError } from './founded';
import { ORG_ICONS } from './kinds';

export function OrgDetailsSheet({
  org,
  open,
  onClose,
  onSaved,
}: {
  org: OrgView;
  open: boolean;
  onClose: () => void;
  onSaved: (org: OrgView) => void;
}) {
  const me = useMe();
  const [name, setName] = useState(org.name);
  const [kind, setKind] = useState<OrgKind>(org.kind);
  const [country, setCountry] = useState<string | null>(org.country);
  const [founded, setFounded] = useState(org.foundedYear ? String(org.foundedYear) : '');
  const [about, setAbout] = useState(org.about ?? '');
  const [website, setWebsite] = useState(org.website ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = {
      name: name.trim() ? undefined : 'Give the organization a name.',
      country: country ? undefined : 'Choose where it’s based.',
      foundedYear: foundedError(founded),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !country) return;
    setBusy(true);
    try {
      const { org: saved } = await endpoints.updateOrg(org.id, {
        name: name.trim(),
        kind,
        country,
        foundedYear: founded ? Number(founded) : null,
        about: about.trim() || null,
        website: website.trim() || null,
      });
      onSaved(saved);
      onClose();
      toast('Saved');
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors()).length) setErrors(e.fieldErrors());
      else toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit details"
      subtitle={`@${org.handle}`}
      footer={
        <Button
          label="Save"
          size="lg"
          block
          loading={busy}
          onPress={() => void save()}
          testID="org-details-save"
        />
      }
    >
      <View style={{ gap: 14 }}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={100}
          error={errors.name}
          testID="org-details-name"
        />
        <ChoiceChips<OrgKind>
          label="What kind of organization"
          value={kind}
          onChange={setKind}
          wrap
          options={ORG_KINDS.map((k) => ({
            value: k,
            label: ORG_KIND_LABELS[k],
            icon: ORG_ICONS[k],
          }))}
        />
        <CountryField
          label="Where it’s based"
          value={country}
          onChange={setCountry}
          locale={me.locale}
          error={errors.country}
          hint="Sets its defaults, like the currency of its cards."
          testID="org-details-country"
        />
        <TextField
          label="Year it began (optional)"
          value={founded}
          onChangeText={(v) => setFounded(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          error={errors.foundedYear}
          style={{ maxWidth: 220 }}
          testID="org-details-founded"
        />
        <TextField
          label="About (optional)"
          value={about}
          onChangeText={setAbout}
          maxLength={500}
          multiline
        />
        <TextField
          label="Website (optional)"
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://datac.com"
          error={errors.website}
        />
      </View>
    </Sheet>
  );
}
