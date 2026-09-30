import type { InviteView } from '@caime/core/api';
import { relationshipLabel, SPHERE_DEFS } from '@caime/core/taxonomy';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import {
  type FormState,
  initialForm,
  RelationshipForm,
  toDraft,
} from '@/features/relationships/RelationshipPicker';
import { copyText } from '@/lib/clipboard';
import { shareLink } from '@/lib/share';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Copy, Link, Trash } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

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
      toast('Link taken back');
      void qc.invalidateQueries({ queryKey: qk.invites });
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const share = (invite: InviteView) =>
    void shareLink(`${me.displayName} invited you to Caime:`, invite.url);
  const copy = async (invite: InviteView) => {
    if (await copyText(invite.url)) toast('Link copied');
    else toast(invite.url);
  };

  if (step === 'classify')
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="How will you know them?"
        footer={
          <Button
            label="Done"
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
        title="Your invite link"
        subtitle="Whoever opens it signs up in half a minute and lands in a conversation with you, connected."
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label="Share the link"
              size="lg"
              block
              icon={Link}
              onPress={() => share(made)}
              testID="invite-share"
            />
            <Button
              label="Copy the link"
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
              They’ll be
            </Text>
            <RelationshipChip label={made.relationship.label} sphere={made.relationship.sphere} />
          </View>
        ) : null}
        <Text variant="caption" color="textTertiary">
          The link works for {daysLeft(made)} days, for anyone who has it. Take it back here any
          time.
        </Text>
      </Sheet>
    );

  const label = draft ? relationshipLabel(draft) : null;
  const live = invites.data?.invites ?? [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite someone"
      subtitle="A link that lands them in a conversation with you, connected, the moment they sign up."
      footer={
        <Button
          label="Make the link"
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
          title={label ? 'How you’ll know them' : 'How will you know them?'}
          subtitle={label ? undefined : 'Optional. They never see your label.'}
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
            <Text variant="bodyStrong">Show them the context</Text>
            <Text variant="caption" color="textSecondary">
              The page they open says “{SPHERE_DEFS[draft.sphere].label}
              {draft.orgName ? ` · ${draft.orgName}` : ''}”, not your label, so they know who’s
              asking.
            </Text>
          </View>
          <Switch
            value={showContext}
            onValueChange={setShowContext}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Show the context"
          />
        </View>
      ) : null}
      <TextField
        label="A line for them (optional)"
        placeholder="Hi, it’s…"
        value={note}
        onChangeText={setNote}
        maxLength={280}
        multiline
        testID="invite-note"
      />
      {live.length ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          <Text variant="overline" color="textTertiary">
            Links you’ve made
          </Text>
          <View style={{ marginHorizontal: -20 }}>
            {live.map((i) => (
              <ListRow
                key={i.id}
                icon={Link}
                title={i.relationship?.label ?? 'Anyone'}
                subtitle={`${i.uses === 1 ? '1 person joined' : `${i.uses} people joined`} · ${daysLeft(i)} days left`}
                onPress={() => share(i)}
                accessibilityLabel={`Share the invite for ${i.relationship?.label ?? 'anyone'}`}
                right={
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <IconButton icon={Copy} label="Copy the link" onPress={() => void copy(i)} />
                    <IconButton
                      icon={Trash}
                      label="Take the link back"
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
