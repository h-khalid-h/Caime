/**
 * Setting up an automation (PRD §69): whose, what and which words, and where to keep it, in the
 * words it'll be listed by ("When a customer sends a file with “invoice”, save it to Customer
 * Files"). Nothing is kept until it's saved here.
 */
import type { AutomationView } from '@caime/core/api';
import {
  describeAutomation,
  SAVE_KINDS,
  type SaveKind,
  withoutWord,
  wordsFrom,
} from '@caime/core/automations';
import { ROLES, SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSaved } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Choice } from '@/features/settings/SettingsPage';
import { SwitchRow } from '@/features/settings/SwitchRow';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const KIND_LABELS: Record<SaveKind, string> = {
  document: 'Files',
  photo: 'Photos',
  video: 'Videos',
  audio: 'Voice notes',
  link: 'Links',
};

const ANYONE = 'anyone';
const ALL = 'all';

function Overline({ children }: { children: string }) {
  return (
    <Text variant="overline" color="textTertiary" accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Choosing where it's kept, loaded as the sheet opens (the two sheets that use it share it). */
const CollectionPicker = lazyPart(() =>
  import('@/features/saved/CollectionPicker').then((m) => m.CollectionPicker),
);

export function AutomationSheet({
  automation,
  onClose,
}: {
  /** The one being changed; none, a new one. */
  automation: AutomationView | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saved = useSaved();
  const [sphere, setSphere] = useState<string>(automation?.when.sphere ?? ANYONE);
  const [role, setRole] = useState<string>(automation?.when.role ?? ALL);
  const [kinds, setKinds] = useState<SaveKind[]>(automation?.when.kinds ?? ['document']);
  const [words, setWords] = useState((automation?.when.words ?? []).join(', '));
  const [collection, setCollection] = useState<string | null>(automation?.collection ?? null);
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const when = {
    sphere: sphere === ANYONE ? null : (sphere as Sphere),
    role: sphere === ANYONE || role === ALL ? null : role,
    kinds,
    words: wordsFrom(words),
  };
  const target = collection ?? '';
  const roles = sphere === ANYONE ? [] : ROLES[sphere as Sphere];
  const done = () => {
    void qc.invalidateQueries({ queryKey: qk.automations });
    void qc.invalidateQueries({ queryKey: qk.saved });
    onClose();
  };
  const save = async () => {
    setBusy(true);
    try {
      if (automation)
        await endpoints.updateAutomation(automation.id, { when, collection: target, enabled });
      else await endpoints.createAutomation({ when, collection: target });
      toast(automation ? (enabled ? 'Automation changed' : 'Automation off') : 'Automation on');
      done();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!automation) return;
    try {
      await endpoints.deleteAutomation(automation.id);
      toast('Automation removed. What it saved stays saved.');
      done();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const toggle = (k: SaveKind) =>
    setKinds((ks) =>
      ks.includes(k) ? (ks.length > 1 ? ks.filter((x) => x !== k) : ks) : [...ks, k],
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title={automation ? 'An automation' : 'A new automation'}
      subtitle={
        target
          ? describeAutomation({ when, collection: target })
          : 'Keep what arrives, as it arrives'
      }
      footer={
        <Button
          label={automation ? 'Save' : 'Turn it on'}
          block
          size="lg"
          loading={busy}
          disabled={!target}
          onPress={() => void save()}
          testID="automation-save"
        />
      }
    >
      <View style={{ gap: 12 }} testID="automation-sheet">
        {automation ? (
          <SwitchRow
            label="On"
            detail={
              enabled ? 'Keeps what matches as it arrives' : 'Keeps nothing until it’s on again'
            }
            value={enabled}
            onChange={setEnabled}
            testID="automation-enabled"
          />
        ) : null}
        <Overline>When</Overline>
        <View style={{ marginHorizontal: -20 }}>
          <Choice<string>
            label="Who sends it"
            value={sphere}
            onChange={(v) => {
              setSphere(v);
              setRole(ALL);
            }}
            options={[
              {
                value: ANYONE,
                label: 'Anyone',
                detail: 'In your conversations, once you’ve let them in',
              },
              ...SPHERES.filter((s) => s !== 'other').map((s) => ({
                value: s,
                label: SPHERE_DEFS[s].plural,
              })),
            ]}
          />
        </View>
        {roles.length ? (
          <View style={{ marginHorizontal: -20 }}>
            <Choice<string>
              label="Of them"
              value={role}
              onChange={setRole}
              options={[
                { value: ALL, label: `All ${SPHERE_DEFS[sphere as Sphere].plural.toLowerCase()}` },
                ...roles.map((r) => ({ value: r.id, label: r.plural })),
              ]}
            />
          </View>
        ) : null}
        <Overline>Sends</Overline>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          accessibilityLabel="What they send"
        >
          {SAVE_KINDS.map((k) => (
            <Chip
              key={k}
              label={KIND_LABELS[k]}
              selected={kinds.includes(k)}
              onPress={() => toggle(k)}
              testID={`automation-kind-${k}`}
            />
          ))}
        </View>
        <TextField
          label="With any of these words (optional)"
          hint="In its name, or in the message it comes with. Separate them with commas."
          value={words}
          onChangeText={setWords}
          placeholder="invoice, receipt"
          testID="automation-words"
        />
        {wordsFrom(words).length ? (
          // How the words are read, one each: a tap takes one out.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {wordsFrom(words).map((w) => (
              <Chip
                key={w}
                label={`${w}  ×`}
                size="sm"
                accessibilityLabel={`Take out “${w}”`}
                onPress={() => setWords(withoutWord(words, w))}
              />
            ))}
          </View>
        ) : null}
        <Overline>Save it to</Overline>
        <CollectionPicker
          label="Save it to"
          value={collection}
          onChange={setCollection}
          collections={saved.data?.collections ?? []}
          placeholder="Customer Files"
          testID="automation-collection"
        />
        {automation ? (
          confirming ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
              <Button
                label="Remove it"
                variant="danger"
                onPress={() => void remove()}
                style={{ flex: 1 }}
                testID="automation-delete-confirm"
              />
              <Button
                label="Keep it"
                variant="secondary"
                onPress={() => setConfirming(false)}
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirming(true)}
              style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}
              testID="automation-delete"
            >
              <Text variant="captionStrong" color="danger">
                Remove this automation
              </Text>
            </Pressable>
          )
        ) : null}
        <Text variant="caption" color="textTertiary">
          Nothing is kept from a private conversation, from a message request you haven’t accepted,
          or from someone blocked. What’s kept goes when its message does.
        </Text>
      </View>
    </Sheet>
  );
}
