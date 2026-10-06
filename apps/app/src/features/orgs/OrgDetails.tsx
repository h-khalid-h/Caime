/**
 * An organization's details, as its owner and admins change them: its logo, its name, what it
 * is, where it's based (its defaults: the currency of its cards), the year it began, what it does
 * and its website. Its handle stays: people and links know it by that.
 */

import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { latestFoundedYear, ORG_KIND_LABELS, ORG_KINDS, type OrgKind } from '@caime/core/orgs';
import Camera from 'lucide-react-native/icons/camera';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { uploadFile } from '@/api/upload';
import { CountryField } from '@/features/geo/CountryField';
import { AVATAR_MAX_EDGE } from '@/lib/photoSize';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { lazyPart } from '@/ui/Lazy';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { ORG_ICONS, OrgMark } from './kinds';

/** The year list, loaded with the form: two screens share it, and neither is the first thing loaded. */
const YearField = lazyPart(() => import('@/ui/YearField').then((m) => m.YearField));

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
  const [founded, setFounded] = useState<number | null>(org.foundedYear);
  const [logo, setLogo] = useState(org.avatarUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [about, setAbout] = useState(org.about ?? '');
  const [website, setWebsite] = useState(org.website ?? '');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = {
      name: name.trim() ? undefined : 'Give the organization a name.',
      country: country ? undefined : tr('Choose where it’s based.'),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !country) return;
    setBusy(true);
    try {
      const { org: saved } = await endpoints.updateOrg(org.id, {
        name: name.trim(),
        kind,
        country,
        foundedYear: founded,
        about: about.trim() || null,
        website: website.trim() || null,
      });
      onSaved(saved);
      onClose();
      toast(tr('Saved'));
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors()).length) setErrors(e.fieldErrors());
      else toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  /** The logo changes at once: it's the organization's face everywhere, not a draft. */
  const changeLogo = async () => {
    const res = await pickFromLibrary({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setLogoBusy(true);
    try {
      const file = await uploadFile(await photoToUpload(a, 'logo.jpg', AVATAR_MAX_EDGE));
      const { org: saved } = await endpoints.updateOrg(org.id, { avatarFileId: file.id });
      setLogo(saved.avatarUrl);
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const { org: saved } = await endpoints.updateOrg(org.id, { avatarFileId: null });
      setLogo(null);
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Edit details')}
      subtitle={`@${org.handle}`}
      footer={
        <Button
          label={tr('Save')}
          size="lg"
          block
          loading={busy}
          onPress={() => void save()}
          testID="org-details-save"
        />
      }
    >
      <View style={{ gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <OrgMark kind={kind} url={logo} size={88} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={logo ? tr('Change logo') : tr('Add a logo')}
              icon={Camera}
              variant="secondary"
              size="sm"
              onPress={() => void changeLogo()}
              loading={logoBusy}
              testID="org-logo-change"
            />
            {logo ? (
              <Button
                label={tr('Remove')}
                variant="ghost"
                size="sm"
                onPress={() => void removeLogo()}
                disabled={logoBusy}
                testID="org-logo-remove"
              />
            ) : null}
          </View>
          <Text variant="caption" color="textTertiary" align="center">
            {tr('Shown wherever the organization is: its page, its conversations, its updates.')}
          </Text>
        </View>
        <TextField
          label={tr('Name')}
          value={name}
          onChangeText={setName}
          maxLength={100}
          error={errors.name}
          testID="org-details-name"
        />
        <ChoiceChips<OrgKind>
          label={tr('What kind of organization')}
          value={kind}
          onChange={setKind}
          wrap
          options={ORG_KINDS.map((k) => ({
            value: k,
            label: tr(ORG_KIND_LABELS[k]),
            icon: ORG_ICONS[k],
          }))}
        />
        <CountryField
          label={tr('Where it’s based')}
          value={country}
          onChange={setCountry}
          locale={me.locale}
          error={errors.country}
          hint={tr('Sets its defaults, like the currency of its cards.')}
          testID="org-details-country"
        />
        <YearField
          label={tr('Year it began (optional)')}
          value={founded}
          onChange={setFounded}
          min={1000}
          max={latestFoundedYear()}
          optional
          error={errors.foundedYear}
          testID="org-details-founded"
        />
        <TextField
          label={tr('About (optional)')}
          value={about}
          onChangeText={setAbout}
          maxLength={500}
          multiline
        />
        <TextField
          label={tr('Website (optional)')}
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
