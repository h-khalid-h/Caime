import type { InviteView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import { relationshipLabel, SPHERE_DEFS } from '@caime/core/taxonomy';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Copy from 'lucide-react-native/icons/copy';
import Link from 'lucide-react-native/icons/link';
import Trash from 'lucide-react-native/icons/trash';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { type FormState, initialForm, toDraft } from '@/features/relationships/form';
import { copyText } from '@/lib/clipboard';
import { shareLink } from '@/lib/share';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

// The form itself loads with the sheet's first paint; the picker's module stays out of the
// startup chunk, which every lazy sheet sharing it statically would put it in.
const RelationshipForm = lazyPart(() =>
  import('@/features/relationships/RelationshipPicker').then((m) => m.RelationshipForm),
);

/**
 * An invite link (R1): whoever opens it signs up in half a minute and lands in the conversation,
 * connected, as I said I know them. How I know them stays mine; the context ("Work · DATA C")
 * is shown to them only if I say so. The links I've made are here to share again or take back.
 */
export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const [step, setStep] = useState<'details' | 'classify' | 'made'>('details');
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [note, setNote] = useState('');
  const [showContext, setShowContext] = useState(true);
  const [made, setMade] = useState<InviteView | null>(null);
  useEffect(() => {
    if (open) {
      setStep('details');
      setForm(initialForm());
      setNote('');
      setMade(null);
    }
  }, [open]);
  const draft = toDraft(form);
  const invites = useQuery({ queryKey: qk.invites, queryFn: endpoints.invites, enabled: open });
  const make = useMutation({
    mutationFn: () =>
      endpoints.makeInvite({
        relationship: draft ?? undefined,
        showContext,
        note: note.trim() || null,
      }),
    onSuccess: ({ invite }) => {
      setMade(invite);
      setStep('made');
      void qc.invalidateQueries({ queryKey: qk.invites });
      if (draft?.orgName) void qc.invalidateQueries({ queryKey: qk.taxonomy });
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => endpoints.revokeInvite(id),
    onSuccess: () => {
      toast(tr('Link taken back'));
      void qc.invalidateQueries({ queryKey: qk.invites });
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const share = (invite: InviteView) =>
    void shareLink(
      tr('{displayName} invited you to Caime:', { displayName: me.displayName }),
      invite.url,
    );
  const copy = async (invite: InviteView) => {
    if (await copyText(invite.url)) toast(tr('Link copied'));
    else toast(invite.url);
  };

  if (step === 'classify')
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={tr('How will you know them?')}
        footer={
          <Button
            label={tr('Done')}
            size="lg"
            block
            disabled={!form.sphere}
            onPress={() => setStep('details')}
            testID="relationship-save"
          />
        }
      >
        <RelationshipForm name="them" value={form} onChange={setForm} />
      </Sheet>
    );

  if (step === 'made' && made)
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={tr('Your invite link')}
        subtitle={tr(
          'Whoever opens it signs up in half a minute and lands in a conversation with you, connected.',
        )}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Share the link')}
              size="lg"
              block
              icon={Link}
              onPress={() => share(made)}
              testID="invite-share"
            />
            <Button
              label={tr('Copy the link')}
              variant="secondary"
              size="lg"
              block
              icon={Copy}
              onPress={() => void copy(made)}
              testID="invite-copy"
            />
          </View>
        }
      >
        <Text variant="body" selectable testID="invite-url">
          {made.url}
        </Text>
        {made.relationship ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" color="textSecondary">
              {tr('They’ll be')}
            </Text>
            <RelationshipChip label={made.relationship.label} sphere={made.relationship.sphere} />
          </View>
        ) : null}
        <Text variant="caption" color="textTertiary">
          {trn(
            daysLeft(made),
            'The link works for {n} day, for anyone who has it. Take it back here any time.',
            'The link works for {n} days, for anyone who has it. Take it back here any time.',
          )}
        </Text>
      </Sheet>
    );

  const label = draft ? relationshipLabel(draft) : null;
  const live = invites.data?.invites ?? [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Invite someone')}
      subtitle={tr(
        'A link that lands them in a conversation with you, connected, the moment they sign up.',
      )}
      footer={
        <Button
          label={tr('Make the link')}
          size="lg"
          block
          loading={make.isPending}
          onPress={() => make.mutate()}
          testID="invite-make"
        />
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <ListRow
          title={label ? tr('How you’ll know them') : tr('How will you know them?')}
          subtitle={label ? undefined : tr('Optional. They never see your label.')}
          right={
            label && draft ? (
              <RelationshipChip label={label} sphere={draft.sphere} size="md" />
            ) : null
          }
          chevron
          onPress={() => setStep('classify')}
          testID="invite-classify"
        />
      </View>
      {draft ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{tr('Show them the context')}</Text>
            <Text variant="caption" color="textSecondary">
              {tr('The page they open says “{label}”, not your label, so they know who’s asking.', {
                label: [tr(SPHERE_DEFS[draft.sphere].label), draft.orgName]
                  .filter(Boolean)
                  .join(' · '),
              })}
            </Text>
          </View>
          <Switch
            value={showContext}
            onValueChange={setShowContext}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel={tr('Show the context')}
          />
        </View>
      ) : null}
      <TextField
        label={tr('A line for them (optional)')}
        placeholder={tr('Hi, it’s…')}
        value={note}
        onChangeText={setNote}
        maxLength={280}
        multiline
        testID="invite-note"
      />
      {live.length ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          <Text variant="overline" color="textTertiary">
            {tr('Links you’ve made')}
          </Text>
          <View style={{ marginHorizontal: -20 }}>
            {live.map((i) => (
              <ListRow
                key={i.id}
                icon={Link}
                title={i.relationship?.label ?? tr('Anyone')}
                subtitle={tr('{person} · {daysLeft} days left', {
                  person: trn(i.uses, '{n} person joined', '{n} people joined'),
                  daysLeft: daysLeft(i),
                })}
                onPress={() => share(i)}
                accessibilityLabel={tr('Share the invite for {label}', {
                  label: i.relationship?.label ?? 'anyone',
                })}
                right={
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <IconButton
                      icon={Copy}
                      label={tr('Copy the link')}
                      onPress={() => void copy(i)}
                    />
                    <IconButton
                      icon={Trash}
                      label={tr('Take the link back')}
                      onPress={() => revoke.mutate(i.id)}
                      testID={`invite-revoke-${i.id}`}
                    />
                  </View>
                }
              />
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const daysLeft = (i: InviteView) =>
  Math.max(0, Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / 86_400_000));
