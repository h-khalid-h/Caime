import { tr } from '@caime/core/i18n';
import { canManageOrg } from '@caime/core/orgs';
import { SPACE_KIND_DEFS, SPACE_KINDS, type SpaceKind } from '@caime/core/spaces';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useOrg, useOrgs } from '@/api/hooks';
import { qk } from '@/api/keys';
import { OrgMark } from '@/features/orgs/kinds';
import { PeoplePicker, toggled } from '@/features/people/PeoplePicker';
import { SPACE_ICONS } from '@/features/spaces/kinds';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Back } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/**
 * Start a space (PRD §40): whose it is, what it's called, what kind, and who's in it to begin
 * with. One place for every space: someone on no organization's team starts their own and is
 * asked nothing more; someone on one or more teams says whose space it is first (theirs, or an
 * organization they run, R43), and an organization's page comes here with it chosen
 * (`?org=handle`). An organization's space takes its team, and stays with the organization.
 */
export default function NewSpace() {
  const { desktop } = useLayout();
  const qc = useQueryClient();
  const { org: orgHandle } = useLocalSearchParams<{ org?: string }>();
  const me = useSession((s) => s.user?.id ?? '');
  const orgs = useOrgs().data?.orgs ?? [];
  // The ones they run are theirs to choose; the others are said, not offered.
  const runs = orgs.filter((o) => canManageOrg(o.myRole));
  const onlyOn = orgs.filter((o) => !canManageOrg(o.myRole));
  // Whose space: 'me', an organization's id, or not said yet (needed once there's a choice).
  const [chosen, setChosen] = useState<'me' | string | null>(null);
  const fromPage = orgHandle ? (orgs.find((o) => o.handle === orgHandle)?.id ?? null) : null;
  const owner = chosen ?? (orgHandle ? fromPage : orgs.length === 0 ? 'me' : null);
  const ownerOrg = owner && owner !== 'me' ? (orgs.find((o) => o.id === owner) ?? null) : null;
  const org = useOrg(ownerOrg?.handle ?? '').data?.org ?? null;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SpaceKind | null>(orgHandle ? 'team' : null);
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const choose = (id: 'me' | string) => {
    setChosen(id);
    // A team's space is usually a team; their own is whatever they say.
    if (id !== 'me' && !kind) setKind('team');
    setPicked(new Set());
  };

  const create = async () => {
    if (owner === null) return toast(tr('Say whose space it is.'));
    if (!name.trim()) return toast(tr('Give the space a name.'));
    if (!kind) return toast(tr('Choose what kind of space it is.'));
    setBusy(true);
    try {
      const { space } = await endpoints.createSpace({
        name: name.trim(),
        kind,
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        memberIds: [...picked],
        ...(org ? { orgId: org.id } : {}),
      });
      qc.setQueryData(qk.space(space.id), { space });
      void qc.invalidateQueries({ queryKey: qk.spaces });
      if (org) void qc.invalidateQueries({ queryKey: qk.orgSpaces(org.id) });
      router.replace({ pathname: '/s/[id]', params: { id: space.id } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={
          <IconButton
            icon={Back}
            label={tr('Back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/spaces'))}
          />
        }
        title={org ? tr('New space for {name}', { name: org.name }) : tr('New space')}
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
        {orgs.length > 0 ? (
          <View style={{ gap: 8 }} testID="space-owner">
            <Text variant="label">{tr('Whose space')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip
                label={tr('Mine')}
                selected={owner === 'me'}
                onPress={() => choose('me')}
                testID="space-owner-me"
              />
              {runs.map((o) => (
                <Chip
                  key={o.id}
                  label={o.name}
                  selected={owner === o.id}
                  onPress={() => choose(o.id)}
                  testID={`space-owner-${o.handle}`}
                />
              ))}
            </View>
            <Text variant="caption" color="textSecondary">
              {owner === 'me'
                ? tr('Yours: people you’re connected with can be in it, and it stays with you.')
                : owner
                  ? tr(
                      'The organization’s: anyone on its team can be in it, and it stays with the organization.',
                    )
                  : tr('Yours, or an organization you run.')}
              {onlyOn.length
                ? tr(
                    ' Only an organization’s owner and admins start its spaces, so not {join}’s.',
                    { join: onlyOn.map((o) => o.name).join(', ') },
                  )
                : ''}
            </Text>
          </View>
        ) : null}
        {org ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            testID="space-for-org"
          >
            <OrgMark kind={org.kind} url={org.avatarUrl} size={36} />
            <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
              {tr(
                '{name}’s space: anyone on its team can be in it, and it stays with the organization.',
                { name: org.name },
              )}
            </Text>
          </View>
        ) : null}
        <TextField
          label={tr('Name')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          placeholder={
            org
              ? tr('Front desk, Design team, Everyone…')
              : tr('The Haddads, Design team, Book club…')
          }
          testID="space-name"
        />
        <View style={{ gap: 8 }}>
          <Text variant="label">{tr('What kind of space')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPACE_KINDS.map((k) => (
              <Chip
                key={k}
                label={tr(SPACE_KIND_DEFS[k].label)}
                icon={SPACE_ICONS[k]}
                selected={kind === k}
                onPress={() => setKind(k)}
                testID={`space-kind-${k}`}
              />
            ))}
          </View>
          <Text variant="caption" color="textSecondary">
            {kind
              ? tr('{tr}. Its conversations offer the cards that fit it.', {
                  tr: tr(SPACE_KIND_DEFS[kind].hint),
                })
              : tr('It decides which cards its conversations offer.')}
          </Text>
        </View>
        <TextField
          label={tr('What it’s for (optional)')}
          value={purpose}
          onChangeText={setPurpose}
          maxLength={280}
        />
        <Text variant="overline" color="textTertiary">
          {tr('People · {size} chosen', { size: picked.size })}
        </Text>
        <PeoplePicker
          picked={picked}
          onToggle={(id) => setPicked((p) => toggled(p, id))}
          among={
            org
              ? {
                  people: org.members
                    ?.filter((m) => m.userId !== me && m.person.kind === 'human')
                    .map((m) => ({
                      id: m.userId,
                      displayName: m.person.displayName,
                      handle: m.person.handle,
                      avatarUrl: m.person.avatarUrl,
                      relationship: null,
                    })),
                  empty: tr('Nobody else is on the team yet. Add people to the team first.'),
                }
              : undefined
          }
        />
        <Text variant="caption" color="textSecondary">
          {org
            ? tr(
                'You can add people later too: the team, or people you’re connected with. Everyone in the space is in its General conversation.',
              )
            : tr(
                'You can add people later too. Everyone in the space is in its General conversation.',
              )}
        </Text>
        <Button
          label={tr('Start the space')}
          size="lg"
          block
          onPress={() => void create()}
          loading={busy}
          testID="space-create"
        />
      </ScrollView>
    </Screen>
  );
}
