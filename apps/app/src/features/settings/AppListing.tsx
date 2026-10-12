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
  APP_PROVIDES,
  APP_PROVIDES_LABELS,
  APP_TAGLINE_MAX,
  type AppCategory,
  type AppProvides,
  appIconPath,
} from '@caime/core/app-directory';
import { tr } from '@caime/core/i18n';
import {
  AI_USE_DAYS_MAX,
  APP_LANGUAGES,
  APP_PRICING,
  APP_PRICING_LABELS,
  APP_SCREENSHOTS_MAX,
  type AppPricing,
  appScreenshotPath,
  marketplacePath,
  SCREENSHOT_MIN_WIDTH,
  SCREENSHOT_RATIO,
  SCREENSHOT_RATIO_SLACK,
} from '@caime/core/marketplace';
import { canManageOrg } from '@caime/core/orgs';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import X from 'lucide-react-native/icons/x';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ApiError, mediaHeaders, mediaUrl } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useOrgs } from '@/api/hooks';
import { qk } from '@/api/keys';
import { uploadFile } from '@/api/upload';
import { AppIcon } from '@/features/apps/AppIcon';
import { WEB_URL } from '@/lib/config';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { openLink } from '@/lib/links';
import { AVATAR_MAX_EDGE, PHOTO_MAX_EDGE } from '@/lib/photoSize';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

type Category = 'none' | AppCategory;
type Pricing = 'none' | AppPricing;
/** A screenshot as the form holds it: its file, and where it's drawn from now. */
type Shot = { id: string; url: string };

/** The listing's screenshots as saved, each from where its owner reads it (R80). */
const savedShots = (app: OAuthAppView): Shot[] =>
  app.listing.screenshotIds.map((id, n) => ({ id, url: appScreenshotPath(app.id, n, id) }));

/** Is a picture 8:5 and wide enough? The server holds the same rule; this says it at once. */
const fitsScreenshot = (w: number | null, h: number | null) =>
  Boolean(w && h) &&
  Math.abs((w as number) / (h as number) - SCREENSHOT_RATIO) <=
    SCREENSHOT_RATIO * SCREENSHOT_RATIO_SLACK &&
  (w as number) >= SCREENSHOT_MIN_WIDTH;

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
  const t = useTheme();
  const orgs = (useOrgs().data?.orgs ?? []).filter((o) => canManageOrg(o.myRole));
  const [tagline, setTagline] = useState(app.listing.tagline ?? '');
  const [description, setDescription] = useState(app.listing.description ?? '');
  const [category, setCategory] = useState<Category>(app.listing.category ?? 'none');
  const [provides, setProvides] = useState<AppProvides[]>(app.listing.provides);
  const [pricing, setPricing] = useState<Pricing>(app.listing.pricing ?? 'none');
  const [languages, setLanguages] = useState<string[]>(app.listing.languages);
  const [supportUrl, setSupportUrl] = useState(app.listing.supportUrl ?? '');
  const [privacyUrl, setPrivacyUrl] = useState(app.listing.privacyUrl ?? '');
  const [usesAi, setUsesAi] = useState(app.listing.aiUse !== null);
  const [aiModel, setAiModel] = useState(app.listing.aiUse?.model ?? '');
  const [aiKeeps, setAiKeeps] = useState(app.listing.aiUse?.keeps ?? '');
  const [aiDays, setAiDays] = useState(app.listing.aiUse ? String(app.listing.aiUse.days) : '0');
  const [aiWhere, setAiWhere] = useState(app.listing.aiUse?.where ?? '');
  const [shots, setShots] = useState<Shot[]>(() => savedShots(app));
  const [loginUrl, setLoginUrl] = useState(app.listing.loginUrl ?? '');
  const [orgId, setOrgId] = useState<string>(app.listing.orgId ?? 'me');
  const [listed, setListed] = useState(app.listing.state !== 'none');
  // A chosen icon shows at once from its own file; the listing's address once it's saved.
  const [icon, setIcon] = useState<{ id: string; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState<'save' | 'icon' | 'shot' | null>(null);
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
  const addShot = async () => {
    const res = await pickFromLibrary({ mediaTypes: ['images'], quality: 0.92 });
    if (res.canceled || !res.assets[0]) return;
    setBusy('shot');
    try {
      const file = await uploadFile(
        await photoToUpload(res.assets[0], 'screenshot.png', PHOTO_MAX_EDGE),
      );
      if (!fitsScreenshot(file.width, file.height)) {
        toast(
          tr('A screenshot is 8:5 and at least {width} pixels wide.', {
            width: SCREENSHOT_MIN_WIDTH,
          }),
          { tone: 'danger' },
        );
        return;
      }
      setShots((s) => [...s, { id: file.id, url: file.previewUrl ?? file.url }]);
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
        provides,
        pricing: pricing === 'none' ? null : pricing,
        languages,
        supportUrl: supportUrl.trim() || null,
        privacyUrl: privacyUrl.trim() || null,
        aiUse: usesAi
          ? {
              model: aiModel.trim(),
              keeps: aiKeeps.trim(),
              days: Math.min(AI_USE_DAYS_MAX, Math.max(0, Number.parseInt(aiDays, 10) || 0)),
              where: aiWhere.trim(),
            }
          : null,
        screenshotIds: shots.map((s) => s.id),
        loginUrl: loginUrl.trim() || null,
        ...(icon ? { iconFileId: icon.id } : {}),
        orgId: orgId === 'me' ? null : orgId,
        listed,
      });
      setIcon(null);
      setShots(savedShots(r.app));
      void qc.invalidateQueries({ queryKey: qk.oauthApps });
      // Discover shows the listing as it stands now (a withdrawn one leaves at once).
      void qc.invalidateQueries({ queryKey: qk.allDirectory });
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
      <ChoiceChips<AppProvides>
        label={tr('Gives Caime')}
        multiple
        value={provides}
        onChange={setProvides}
        wrap
        options={APP_PROVIDES.map((p) => ({
          value: p,
          label: tr(APP_PROVIDES_LABELS[p]),
          testID: `listing-provides-${p}`,
        }))}
      />
      <Text variant="caption" color="textTertiary">
        {tr(
          'What your app does for Caime, if anything: a calendar it keeps in step, or mail it carries. Reviewed with the listing.',
        )}
      </Text>
      <ChoiceChips<Pricing>
        label={tr('How it’s paid for')}
        value={pricing}
        onChange={setPricing}
        wrap
        options={[
          { value: 'none', label: tr('Not said'), testID: 'listing-pricing-none' },
          ...APP_PRICING.map((p) => ({
            value: p,
            label: tr(APP_PRICING_LABELS[p]),
            testID: `listing-pricing-${p}`,
          })),
        ]}
      />
      <Text variant="caption" color="textTertiary">
        {tr('Caime never takes the money: people pay you, as they would anywhere.')}
      </Text>
      <ChoiceChips<string>
        label={tr('Works in')}
        multiple
        value={languages}
        onChange={setLanguages}
        wrap
        options={APP_LANGUAGES.map((l) => ({
          value: l,
          label: LANGUAGE_NAMES[l],
          testID: `listing-language-${l}`,
        }))}
      />
      <TextField
        label={tr('Where to get help')}
        value={supportUrl}
        onChangeText={setSupportUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://digest.example/help"
        hint={tr('A page, or mailto: and an address. Shown on the listing.')}
        error={errors.supportUrl}
        testID="listing-support"
      />
      <TextField
        label={tr('Privacy policy')}
        value={privacyUrl}
        onChangeText={setPrivacyUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://digest.example/privacy"
        error={errors.privacyUrl}
        testID="listing-privacy"
      />
      <SwitchRow
        label={tr('Puts people’s words through an AI model')}
        detail={tr('Then the listing says which, what it keeps, for how long and where.')}
        value={usesAi}
        onChange={setUsesAi}
        testID="listing-ai"
      />
      {usesAi ? (
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Which model')}
            value={aiModel}
            onChangeText={setAiModel}
            maxLength={80}
            hint={tr('Its name, and whose it is.')}
            testID="listing-ai-model"
          />
          <TextField
            label={tr('What it keeps')}
            value={aiKeeps}
            onChangeText={setAiKeeps}
            maxLength={200}
            placeholder={tr('Nothing past the answer')}
            testID="listing-ai-keeps"
          />
          <TextField
            label={tr('For how many days')}
            value={aiDays}
            onChangeText={(v) => setAiDays(v.replace(/[^0-9]/g, '').slice(0, 4))}
            keyboardType="number-pad"
            hint={tr('0 when nothing is kept past the answer.')}
            testID="listing-ai-days"
          />
          <TextField
            label={tr('Where it runs')}
            value={aiWhere}
            onChangeText={setAiWhere}
            maxLength={80}
            placeholder={tr('The country or region')}
            testID="listing-ai-where"
          />
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Text variant="captionStrong" color="textSecondary">
          {tr('Screenshots')}
        </Text>
        {shots.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {shots.map((s, n) => (
                <View key={s.id} testID={`listing-shot-${n}`}>
                  <Image
                    source={{ uri: mediaUrl(s.url) ?? undefined, headers: mediaHeaders() }}
                    accessibilityLabel={tr('Screenshot {n}', { n: n + 1 })}
                    accessible
                    contentFit="cover"
                    style={{
                      width: 160,
                      height: 100,
                      borderRadius: t.radii.sm,
                      backgroundColor: t.c.surfaceMuted,
                    }}
                  />
                  <IconButton
                    icon={X}
                    label={tr('Remove screenshot {n}', { n: n + 1 })}
                    size={18}
                    onPress={() => setShots((all) => all.filter((x) => x.id !== s.id))}
                    testID={`listing-shot-remove-${n}`}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
        {shots.length < APP_SCREENSHOTS_MAX ? (
          <Button
            label={tr('Add a screenshot')}
            variant="secondary"
            size="sm"
            loading={busy === 'shot'}
            onPress={() => void addShot()}
            style={{ alignSelf: 'flex-start' }}
            testID="listing-shot-add"
          />
        ) : null}
        <Text variant="caption" color="textTertiary">
          {tr('Up to {n}, 8:5, at least {width} pixels wide.', {
            n: APP_SCREENSHOTS_MAX,
            width: SCREENSHOT_MIN_WIDTH,
          })}
        </Text>
      </View>
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
        detail={tr(
          'Needs a tagline, a category, how it’s paid for, where to get help, a privacy policy and where Connect goes. Caime looks once.',
        )}
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
      {app.listing.state === 'listed' && app.listing.slug ? (
        <Button
          label={tr('See its page in the marketplace')}
          variant="ghost"
          size="sm"
          onPress={() => openLink(`${WEB_URL}${marketplacePath(app.listing.slug ?? '')}`)}
          style={{ alignSelf: 'flex-start' }}
          testID="listing-page"
        />
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
