/**
 * Places (R92): a person's (Settings · Places) or an organization's (its setup), one editor for
 * both. Each place is a name, the parts of its address, a point taken where its owner stands (never
 * looked up from the words), and who sees it: a person's through the privacy evaluator's
 * audience, an organization's to anyone, its customers or its team. The list is saved whole.
 */
import type { PlaceView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import {
  ORG_PLACE_AUDIENCE_LABELS,
  ORG_PLACE_AUDIENCES,
  ORG_PLACE_KINDS,
  type OrgPlaceAudience,
  PERSON_PLACE_KINDS,
  PLACE_KIND_LABELS,
  PLACES_MAX,
  type PlaceKind,
  placeLine,
} from '@caime/core/places';
import type { Audience } from '@caime/core/privacy';
import MapPin from 'lucide-react-native/icons/map-pin';
import { useState } from 'react';
import { View } from 'react-native';
import { CountryField } from '@/features/geo/CountryField';
import { audienceLine } from '@/features/settings/audienceLine';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { ChoiceChips } from '@/ui/Chip';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { useCountryName } from './countryName';
import { placeName } from './placeName';

const AudienceSheet = lazyPart(() =>
  import('@/features/settings/AudienceSheet').then((m) => m.AudienceSheet),
);

export type PlacesOwner = { kind: 'person' } | { kind: 'org' };

type Draft = Omit<PlaceView, 'id'> & { id?: string };

const blank = (owner: PlacesOwner, country: string): Draft => ({
  kind: owner.kind === 'person' ? 'home' : 'hq',
  label: null,
  country,
  city: null,
  area: null,
  street: null,
  building: null,
  floor: null,
  unit: null,
  postalCode: null,
  directions: null,
  point: null,
  audience: owner.kind === 'person' ? { kind: 'nobody' } : null,
  orgAudience: owner.kind === 'org' ? 'team' : null,
});

export function PlacesSetup({
  owner,
  places,
  save,
}: {
  owner: PlacesOwner;
  places: PlaceView[];
  /** Saves the whole list; resolves once saved. */
  save: (places: Draft[]) => Promise<void>;
}) {
  const me = useMe();
  const countryName = useCountryName();
  const [editing, setEditing] = useState<{ at: number | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const commit = async (next: Draft[]) => {
    setBusy(true);
    try {
      await save(next);
      setEditing(null);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const who = (p: Draft) =>
    owner.kind === 'person'
      ? audienceLine(p.audience ?? { kind: 'nobody' })
      : tr(ORG_PLACE_AUDIENCE_LABELS[p.orgAudience ?? 'team']);
  return (
    <View testID="places">
      {places.map((p, i) => (
        <View key={p.id}>
          {i > 0 ? <Divider /> : null}
          <ListRow
            icon={MapPin}
            title={placeName(p)}
            subtitle={`${placeLine(p, countryName)} · ${who(p)}`}
            chevron
            onPress={() => setEditing({ at: i, draft: p })}
            testID={`place-${i}`}
          />
        </View>
      ))}
      {places.length ? <Divider /> : null}
      <View style={{ padding: 16 }}>
        <Button
          label={tr('Add a place')}
          size="sm"
          variant="secondary"
          icon={MapPin}
          disabled={places.length >= PLACES_MAX}
          onPress={() => setEditing({ at: null, draft: blank(owner, me.country ?? '') })}
          testID="place-add"
        />
      </View>
      <PlaceSheet
        owner={owner}
        editing={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={(draft) => {
          const next: Draft[] = [...places];
          if (editing?.at === null || editing?.at === undefined) next.push(draft);
          else next[editing.at] = draft;
          void commit(next);
        }}
        onRemove={
          editing?.at !== null && editing?.at !== undefined
            ? () => void commit(places.filter((_, i) => i !== editing.at))
            : undefined
        }
        onMove={
          editing?.at
            ? () => {
                const at = editing.at as number;
                const next: Draft[] = [...places];
                [next[at - 1], next[at]] = [next[at] as Draft, next[at - 1] as Draft];
                void commit(next);
              }
            : undefined
        }
      />
    </View>
  );
}

function PlaceSheet({
  owner,
  editing,
  busy,
  onClose,
  onSave,
  onRemove,
  onMove,
}: {
  owner: PlacesOwner;
  editing: { at: number | null; draft: Draft } | null;
  busy: boolean;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onRemove?: () => void;
  onMove?: () => void;
}) {
  const me = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seen, setSeen] = useState<Draft | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  // Each opening starts from the place opened; closing keeps it while the sheet fades.
  if (editing && editing.draft !== seen) {
    setSeen(editing.draft);
    setDraft(editing.draft);
  }
  const d = draft;
  const set = (patch: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const text = (key: keyof Draft, label: string, testID: string) => (
    <TextField
      label={label}
      value={(d?.[key] as string | null) ?? ''}
      onChangeText={(v) => set({ [key]: v } as Partial<Draft>)}
      testID={testID}
    />
  );
  const locate = async () => {
    setLocating(true);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast(tr('Caime can’t see where you are. Allow it in your settings.'), { tone: 'danger' });
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      set({ point: { lat: round(coords.latitude), lng: round(coords.longitude) } });
    } catch {
      toast(tr('Couldn’t find where you are just now. Try again.'), { tone: 'danger' });
    } finally {
      setLocating(false);
    }
  };
  const kinds: readonly PlaceKind[] =
    owner.kind === 'person' ? PERSON_PLACE_KINDS : ORG_PLACE_KINDS;
  return (
    <Sheet
      open={editing !== null}
      onClose={onClose}
      title={editing?.at === null ? tr('Add a place') : tr('Change this place')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            loading={busy}
            disabled={!d?.country}
            onPress={() => d && onSave(d)}
            testID="place-save"
          />
          {onRemove ? (
            <Button
              label={tr('Remove')}
              variant="secondary"
              block
              disabled={busy}
              onPress={onRemove}
              testID="place-remove"
            />
          ) : null}
        </View>
      }
    >
      {d ? (
        <View style={{ gap: 12 }}>
          <ChoiceChips<PlaceKind>
            label={tr('What it is')}
            value={d.kind}
            onChange={(kind) => set({ kind })}
            options={kinds.map((k) => ({ value: k, label: tr(PLACE_KIND_LABELS[k]) }))}
            wrap
            flush
            testID="place-kind"
          />
          {text('label', tr('Its name, if not that'), 'place-label')}
          <CountryField
            label={tr('Country')}
            value={d.country}
            onChange={(country) => set({ country })}
            locale={me.locale}
            testID="place-country"
          />
          {text('city', tr('City'), 'place-city')}
          {text('area', tr('Area'), 'place-area')}
          {text('street', tr('Street'), 'place-street')}
          {text('building', tr('Building'), 'place-building')}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>{text('floor', tr('Floor'), 'place-floor')}</View>
            <View style={{ flex: 1 }}>{text('unit', tr('Unit'), 'place-unit')}</View>
          </View>
          {text('postalCode', tr('Postal code'), 'place-postal')}
          {text('directions', tr('How to find it'), 'place-directions')}
          <View style={{ gap: 4 }}>
            <Button
              label={d.point ? tr('Taken where you stand') : tr('Use where I am')}
              icon={MapPin}
              size="sm"
              variant="secondary"
              loading={locating}
              onPress={() => (d.point ? set({ point: null }) : void locate())}
              testID="place-locate"
            />
            <Text variant="caption" color="textSecondary">
              {d.point
                ? tr('A map opens there. Tap again to drop it.')
                : tr('Only where you stand now, and only if you ask: nobody looks an address up.')}
            </Text>
          </View>
          {owner.kind === 'person' ? (
            <View style={{ marginHorizontal: -20 }}>
              <ListRow
                title={tr('Who sees it')}
                subtitle={audienceLine(d.audience ?? { kind: 'nobody' })}
                chevron
                onPress={() => setAudienceOpen(true)}
                testID="place-audience"
              />
            </View>
          ) : (
            <ChoiceSheet<OrgPlaceAudience>
              label={tr('Who sees it')}
              value={d.orgAudience ?? 'team'}
              onChange={(orgAudience) => set({ orgAudience })}
              options={ORG_PLACE_AUDIENCES.map((a) => ({
                value: a,
                label: tr(ORG_PLACE_AUDIENCE_LABELS[a]),
              }))}
              testID="place-org-audience"
            />
          )}
          {me.minor && owner.kind === 'person' ? (
            <Text variant="caption" color="textSecondary">
              {tr('Under 18, a place is shown to your family at most.')}
            </Text>
          ) : null}
          {onMove ? (
            <Button
              label={tr('Move up')}
              size="sm"
              variant="secondary"
              disabled={busy}
              onPress={onMove}
              testID="place-up"
            />
          ) : null}
        </View>
      ) : null}
      {audienceOpen && d ? (
        <AudienceSheet
          title={tr('Who sees it')}
          current={d.audience ?? { kind: 'nobody' }}
          minor={me.minor && owner.kind === 'person'}
          onClose={() => setAudienceOpen(false)}
          onSave={(audience: Audience) => {
            set({ audience });
            setAudienceOpen(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}
