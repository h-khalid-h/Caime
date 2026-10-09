/**
 * An app's listing in Discover (R74): what it says of itself (a tagline, a description, a
 * category, an icon), who it's published under (the developer, or an organization they manage,
 * whose verification Discover shows), where Connect sends people (its own sign-in), and whether
 * it asks to be listed. Caime looks once; any change to what's shown asks again.
 */
import type { OAuthAppView } from '@caime/core/api';
import {
  APP_CATEGORIES,
  APP_CATEGORY_LABELS,
  APP_DESCRIPTION_MAX,
  APP_TAGLINE_MAX,
  type AppCategory,
  appIconPath,
} from '@caime/core/app-directory';
import { tr } from '@caime/core/i18n';
import { canManageOrg } from '@caime/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useOrgs } from '@/api/hooks';
import { qk } from '@/api/keys';
import { uploadFile } from '@/api/upload';
import { AppIcon } from '@/features/apps/AppIcon';
import { AVATAR_MAX_EDGE } from '@/lib/photoSize';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { SwitchRow } from './SwitchRow';

type Category = 'none' | AppCategory;

/** Where the listing stands, in a line. */
function stateLine(app: OAuthAppView): {
  text: string;
  color: 'textSecondary' | 'success' | 'danger';
} {
  const l = app.listing;
  switch (l.state) {
    case 'listed':
      return { text: tr('Listed in Discover.'), color: 'success' };
    case 'waiting':
      return {
        text: tr('Waiting for Caime’s look: it shows once it’s let through.'),
        color: 'textSecondary',
      };
    case 'declined':
      return {
        text: tr('Not listed: {reason} Change it and ask again.', {
          reason: l.declinedReason ?? '',
        }),
        color: 'danger',
      };
    default:
      return { text: tr('Not in Discover.'), color: 'textSecondary' };
  }
}

export function AppListing({
  app,
  onSaved,
}: {
  app: OAuthAppView;
  onSaved: (app: OAuthAppView) => void;
}) {
  const qc = useQueryClient();
  const orgs = (useOrgs().data?.orgs ?? []).filter((o) => canManageOrg(o.myRole));
  const [tagline, setTagline] = useState(app.listing.tagline ?? '');
  const [description, setDescription] = useState(app.listing.description ?? '');
  const [category, setCategory] = useState<Category>(app.listing.category ?? 'none');
  const [loginUrl, setLoginUrl] = useState(app.listing.loginUrl ?? '');
  const [orgId, setOrgId] = useState<string>(app.listing.orgId ?? 'me');
  const [listed, setListed] = useState(app.listing.state !== 'none');
  // A chosen icon shows at once from its own file; the listing's address once it's saved.
  const [icon, setIcon] = useState<{ id: string; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState<'save' | 'icon' | null>(null);
  const iconUrl = icon?.url ?? appIconPath(app.id, app.listing.iconFileId);

  const chooseIcon = async () => {
    const res = await pickFromLibrary({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy('icon');
    try {
      const file = await uploadFile(
        await photoToUpload(res.assets[0], 'icon.jpg', AVATAR_MAX_EDGE),
      );
      setIcon({ id: file.id, url: file.thumbUrl ?? file.url });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    setErrors({});
    try {
      const r = await endpoints.listOAuthApp(app.id, {
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        category: category === 'none' ? null : category,
        loginUrl: loginUrl.trim() || null,
        ...(icon ? { iconFileId: icon.id } : {}),
        orgId: orgId === 'me' ? null : orgId,
        listed,
      });
      setIcon(null);
      void qc.invalidateQueries({ queryKey: qk.oauthApps });
      onSaved(r.app);
      toast(
        r.app.listing.state === 'waiting'
          ? tr('Asked: Caime looks at it once, then it shows in Discover')
          : tr('Saved'),
      );
    } catch (e) {
      const fields = e instanceof ApiError ? e.fieldErrors() : {};
      setErrors(Object.keys(fields).length ? fields : { form: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const state = stateLine(app);
  return (
    <View style={{ gap: 12 }}>
      <Text variant="captionStrong" color="textSecondary">
        {tr('In Discover')}
      </Text>
      <Text variant="caption" color={state.color} testID="listing-state">
        {state.text}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppIcon url={iconUrl} appId={app.id} name={app.name} size={56} />
        <Button
          label={tr('Choose an icon')}
          variant="secondary"
          size="sm"
          loading={busy === 'icon'}
          onPress={() => void chooseIcon()}
          testID="listing-icon"
        />
      </View>
      <TextField
        label={tr('Tagline')}
        value={tagline}
        onChangeText={setTagline}
        maxLength={APP_TAGLINE_MAX}
        placeholder={tr('Your week in Caime, every Monday')}
        error={errors.tagline}
        testID="listing-tagline"
      />
      <TextField
        label={tr('Description')}
        value={description}
        onChangeText={setDescription}
        maxLength={APP_DESCRIPTION_MAX}
        multiline
        error={errors.description}
        testID="listing-description"
      />
      <ChoiceChips<Category>
        label={tr('Category')}
        value={category}
        onChange={setCategory}
        wrap
        options={[
          { value: 'none', label: tr('None'), testID: 'listing-category-none' },
          ...APP_CATEGORIES.map((c) => ({
            value: c,
            label: tr(APP_CATEGORY_LABELS[c]),
            testID: `listing-category-${c}`,
          })),
        ]}
      />
      <TextField
        label={tr('Where Connect goes')}
        value={loginUrl}
        onChangeText={setLoginUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://digest.example/login"
        hint={tr(
          'Your app’s own sign-in, at an https address on a site it returns to or its website. From there it sends people to Caime for what it needs.',
        )}
        error={errors.loginUrl}
        testID="listing-login"
      />
      {orgs.length ? (
        <ChoiceChips<string>
          label={tr('Published by')}
          value={orgId}
          onChange={setOrgId}
          wrap
          options={[
            { value: 'me', label: tr('You'), testID: 'listing-org-me' },
            ...orgs.map((o) => ({ value: o.id, label: o.name, testID: `listing-org-${o.handle}` })),
          ]}
        />
      ) : null}
      <SwitchRow
        label={tr('Listed in Discover')}
        detail={tr('Needs a tagline, a category and where Connect goes. Caime looks once.')}
        value={listed}
        onChange={setListed}
        testID="listing-listed"
      />
      {errors.form ? (
        <Text
          variant="bodyStrong"
          color="danger"
          accessibilityLiveRegion="assertive"
          testID="listing-error"
        >
          {errors.form}
        </Text>
      ) : null}
      <Button
        label={tr('Save the listing')}
        variant="secondary"
        loading={busy === 'save'}
        onPress={() => void save()}
        testID="listing-save"
      />
    </View>
  );
}
