import type { RelationshipView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import {
  fillName,
  primarySpheres,
  rolesForPicker,
  SPHERE_DEFS,
  type Sphere,
  secondarySpheres,
} from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import Lock from 'lucide-react-native/icons/lock';
import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTaxonomy } from '@/api/hooks';
import { qk } from '@/api/keys';
import { wordsMatch } from '@/features/geo/find';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { sphereIcon } from '@/ui/SphereIcon';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { type FormState, initialForm, type RelationshipDraft, toDraft } from './form';

/** How many of the places someone knows people from are offered at once for "Where?". */
const PLACES = 6;

export { type FormState, initialForm, type RelationshipDraft, toDraft } from './form';

/**
 * "How do you know …?": a sphere, then (optionally) a role and where. Three taps at most
 * (PRD §11, W1). The label is private unless the person chooses to share it (R9).
 */
export function RelationshipForm({
  name,
  value,
  onChange,
}: {
  name: string;
  value: FormState;
  onChange: (next: FormState) => void;
}) {
  const t = useTheme();
  const taxonomy = useTaxonomy();
  const [more, setMore] = useState(Boolean(value.sphere && !SPHERE_DEFS[value.sphere].primary));
  const [moreRoles, setMoreRoles] = useState(false);
  const set = (patch: Partial<FormState>) => onChange({ ...value, ...patch });
  const def = value.sphere ? SPHERE_DEFS[value.sphere] : null;
  const roles = value.sphere ? rolesForPicker(value.sphere) : { quick: [], more: [] };
  const custom =
    [...(taxonomy.data?.primary ?? []), ...(taxonomy.data?.more ?? [])].find(
      (s) => s.id === value.sphere,
    )?.customRoles ?? [];
  // The places they've named before (and their own organizations), narrowed as one is typed;
  // one they have is kept as they wrote it there, whatever the case it's typed in.
  const where = value.orgName.replace(/\s+/g, ' ').trim();
  const organizations = taxonomy.data?.organizations ?? [];
  const had = organizations.find((o) => o.name.toLowerCase() === where.toLowerCase());
  const places = had
    ? [had, ...organizations.filter((o) => o !== had)].slice(0, PLACES)
    : organizations.filter((o) => !where || wordsMatch([o.name], where)).slice(0, PLACES);

  const tile = (s: Sphere) => {
    const st = t.sphere(s);
    const Icon = sphereIcon(st.icon);
    const selected = value.sphere === s;
    return (
      <Pressable
        key={s}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={tr(SPHERE_DEFS[s].label)}
        onPress={() => {
          setMoreRoles(false);
          set({ sphere: s, role: null, roleLabel: '' });
        }}
        haptic
        focusRadius={14}
        style={({ hovered }) => ({
          width: '31.5%',
          minHeight: 46,
          paddingHorizontal: 10,
          borderRadius: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: selected ? st.fill : hovered ? t.c.surfaceHover : t.c.surfaceMuted,
          borderWidth: 2,
          borderColor: selected ? st.strong : 'transparent',
        })}
      >
        <Icon size={18} color={st.strong} strokeWidth={2.2} />
        <Text
          variant="captionStrong"
          color={selected ? st.strong : 'text'}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {tr(SPHERE_DEFS[s].label)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lock size={12} color={t.c.textTertiary} />
        <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
          {tr('Only you see this. It changes how Caime treats {name}, never what {name} sees.', {
            name,
          })}
        </Text>
      </View>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        accessibilityRole="radiogroup"
      >
        {primarySpheres().map((d) => tile(d.id))}
        {more ? secondarySpheres().map((d) => tile(d.id)) : null}
      </View>
      {!more ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMore(true)}
          style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
        >
          <Text variant="captionStrong" color="link">
            {tr('More kinds of relationship')}
          </Text>
        </Pressable>
      ) : null}
      {def ? (
        <View style={{ gap: 10 }}>
          <Text variant="label">{fillName(def.roleQuestion, name)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...roles.quick, ...(moreRoles ? roles.more : [])].map((r) => (
              <Chip
                key={r.id}
                label={tr(r.label)}
                selected={value.role === r.id && !value.roleLabel}
                onPress={() => set({ role: value.role === r.id ? null : r.id, roleLabel: '' })}
              />
            ))}
            {custom.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                selected={value.roleLabel === c.label}
                onPress={() => set({ roleLabel: value.roleLabel === c.label ? '' : c.label })}
              />
            ))}
            {!moreRoles && roles.more.length ? (
              <Chip label={tr('More…')} onPress={() => setMoreRoles(true)} />
            ) : null}
          </View>
          <TextField
            placeholder={tr('Or in your own words')}
            value={value.roleLabel}
            onChangeText={(roleLabel) => set({ roleLabel })}
            maxLength={60}
            accessibilityLabel={tr('Role in your own words')}
          />
          {def.asksOrganization ? (
            <>
              <TextField
                label={tr('Where? (optional)')}
                placeholder={tr('Company, school or organization')}
                value={value.orgName}
                onChangeText={(orgName) => set({ orgName })}
                maxLength={120}
              />
              {places.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {places.map((o) => (
                    <Chip
                      key={o.name}
                      label={o.name}
                      selected={o === had}
                      accessibilityLabel={
                        o.people
                          ? tr('{name}, where you know {person}', {
                              name: o.name,
                              person: trn(o.people, '{n} person', '{n} people'),
                            })
                          : o.name
                      }
                      onPress={() => set({ orgName: o === had ? '' : o.name })}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{tr('Share with {name}', { name })}</Text>
              <Text variant="caption" color="textSecondary">
                {tr('If {name} shares too, each of you sees how the other described you.', {
                  name,
                })}
              </Text>
            </View>
            <Switch
              value={value.shared}
              onValueChange={(shared) => set({ shared })}
              accessibilityLabel={tr('Share with {name}', { name })}
              trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The form in its own sheet: classify someone, or change how you classify them. */
export function RelationshipPicker({
  open,
  onClose,
  person,
  current,
  initial,
  onPick,
  skip,
}: {
  open: boolean;
  onClose: () => void;
  person: { id: string; displayName: string };
  current?: RelationshipView | null;
  /** What it starts from when it's a new one: what Caime offered, say. */
  initial?: Partial<RelationshipDraft> | null;
  /** Instead of saving, hand the choice back (accepting a request). */
  onPick?: (draft: RelationshipDraft) => void;
  /** A secondary way out that still counts as a choice ("Accept without a label"). */
  skip?: { label: string; onPress: () => void };
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(current ?? initial));
  const [busy, setBusy] = useState(false);
  // It starts from what it's given each time it opens, and never again while it's open: a
  // refetch underneath (a minute ticking, someone coming online) mustn't undo what's chosen.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setForm(initialForm(current ?? initial));
    wasOpen.current = open;
  }, [open, current, initial]);
  const name = person.displayName.split(' ')[0] ?? person.displayName;

  const save = async () => {
    const draft = toDraft(form);
    if (!draft) return;
    if (onPick) {
      onPick(draft);
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (current) await endpoints.changeRelationship(current.id, draft);
      else await endpoints.classify(person.id, draft);
      // Their own words for a role, and where they know them from, offered next time.
      if (draft.roleLabel)
        void endpoints
          .addCustomRole(draft.sphere, draft.roleLabel)
          .then(() => qc.invalidateQueries({ queryKey: qk.taxonomy }))
          .catch(() => {});
      toast(
        draft.shared ? tr('Saved and shared with {name}', { name }) : tr('Saved. Only you see it.'),
      );
      onClose();
      for (const key of [
        qk.person(person.id),
        qk.connections,
        qk.inbox,
        qk.relationshipHistory(person.id),
        ['conversation'],
        // Which rule applies to them follows how you know them; what Caime offered is answered.
        ['policy-for'],
        ['suggestions'],
        qk.taxonomy,
      ])
        void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('How do you know {name}?', { name })}
      footer={
        <>
          <Button
            label={onPick ? tr('Done') : tr('Save')}
            block
            size="lg"
            onPress={save}
            loading={busy}
            disabled={!form.sphere}
            testID="relationship-save"
          />
          {skip ? (
            <Button
              label={skip.label}
              variant="ghost"
              block
              onPress={() => {
                skip.onPress();
                onClose();
              }}
            />
          ) : null}
        </>
      }
    >
      <RelationshipForm name={name} value={form} onChange={setForm} />
    </Sheet>
  );
}
