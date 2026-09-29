import type { ClosedOrgView } from '@caime/core/api';
import { ORG_KIND_LABELS, ORG_KINDS, type OrgKind } from '@caime/core/orgs';
import { handleError, handleFromName, normalizeHandle } from '@caime/core/rules';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { CountryField } from '@/features/geo/CountryField';
import { foundedError } from '@/features/orgs/founded';
import { ORG_ICONS } from '@/features/orgs/kinds';
import { ReclaimCard } from '@/features/orgs/Reclaim';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, AtSign } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** Create an organization (PRD §36): who it is, and the handle people find it by. */
export default function NewOrganization() {
  const { desktop } = useLayout();
  const qc = useQueryClient();
  const me = useMe();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [kind, setKind] = useState<OrgKind | null>(null);
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  // Where it's based: where its maker lives, until they say otherwise.
  const [country, setCountry] = useState<string | null>(me.country);
  const [founded, setFounded] = useState('');
  const [taken, setTaken] = useState<{
    handle: string;
    reason: string | null;
    /** A closed organization's, verified: it can be taken back (R42). */
    closedOrg?: ClosedOrgView;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!handleTouched) setHandle(handleFromName(name));
  }, [name, handleTouched]);

  // One namespace with people: check as they type.
  useEffect(() => {
    const h = normalizeHandle(handle);
    if (!h || handleError(h)) {
      setTaken(null);
      return;
    }
    const timer = setTimeout(() => {
      endpoints
        .handleAvailable(h)
        .then((r) =>
          setTaken(r.available ? null : { handle: h, reason: r.reason, closedOrg: r.closedOrg }),
        )
        .catch(() => setTaken(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [handle]);

  const create = async () => {
    const h = normalizeHandle(handle);
    const next: Record<string, string | undefined> = {
      name: name.trim() ? undefined : 'Give the organization a name.',
      handle:
        handleError(h) ??
        (taken?.handle === h ? (taken.reason ?? 'That handle isn’t available.') : undefined),
      kind: kind ? undefined : 'Choose what kind of organization it is.',
      country: country ? undefined : 'Choose where it’s based.',
      foundedYear: foundedError(founded),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean) || !kind || !country) return;
    setBusy(true);
    try {
      const { org } = await endpoints.createOrg({
        name: name.trim(),
        handle: h,
        kind,
        country,
        ...(founded ? { foundedYear: Number(founded) } : {}),
        ...(about.trim() ? { about: about.trim() } : {}),
        ...(website.trim() ? { website: website.trim() } : {}),
      });
      qc.setQueryData(qk.org(org.handle), { org });
      void qc.invalidateQueries({ queryKey: qk.orgs });
      router.replace({ pathname: '/o/[handle]', params: { handle: org.handle } });
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = e.fieldErrors();
        const closedOrg = e.details?.closedOrg as ClosedOrgView | undefined;
        if (e.code === 'handle_closed_org' && closedOrg)
          setTaken({ handle: h, reason: e.message, closedOrg });
        else if (Object.keys(fields).length) setErrors(fields);
        else toast(e.message, { tone: 'danger' });
      } else toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/orgs'))}
          />
        }
        title="New organization"
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={100}
          placeholder="DATA C, Nile Dental Clinic…"
          error={errors.name}
          testID="org-name"
        />
        <TextField
          label="Handle"
          icon={AtSign}
          value={handle}
          onChangeText={(v) => {
            setHandleTouched(true);
            setHandle(v);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          hint="How people find it. Shared with people’s handles, so nobody can pose as it."
          error={
            errors.handle ??
            (taken?.handle === normalizeHandle(handle)
              ? (taken.reason ?? 'That handle isn’t available.')
              : undefined)
          }
          testID="org-handle"
        />
        {taken?.closedOrg && taken.handle === normalizeHandle(handle) ? (
          <ReclaimCard closed={taken.closedOrg} />
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="captionStrong" color="textSecondary">
            What kind of organization
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ORG_KINDS.map((k) => (
              <Chip
                key={k}
                label={ORG_KIND_LABELS[k]}
                icon={ORG_ICONS[k]}
                selected={kind === k}
                onPress={() => setKind(k)}
                testID={`org-kind-${k}`}
              />
            ))}
          </View>
          {errors.kind ? (
            <Text variant="caption" color="danger">
              {errors.kind}
            </Text>
          ) : null}
        </View>
        <CountryField
          label="Where it’s based"
          value={country}
          onChange={setCountry}
          locale={me.locale}
          error={errors.country}
          hint="Sets its defaults, like the currency of its cards."
          testID="org-country"
        />
        <TextField
          label="Year it began (optional)"
          value={founded}
          onChangeText={(v) => setFounded(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          placeholder={String(new Date().getFullYear())}
          error={errors.foundedYear}
          hint="Shown on its page."
          style={{ maxWidth: 220 }}
          testID="org-founded"
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
        <Text variant="caption" color="textSecondary">
          Next, verify your domain with one DNS record, so people can see it’s really you.
        </Text>
        <Button
          label="Create it"
          size="lg"
          block
          loading={busy}
          onPress={() => void create()}
          testID="org-create"
        />
      </ScrollView>
    </Screen>
  );
}
