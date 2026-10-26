/**
 * A waiting child names their parent or guardian (R122 (2)): by their handle, never by a name
 * search, and only after seeing who that is ("Is this your parent or guardian?"); or, for a parent
 * who isn't on Caime yet, a link the child sends them from their own phone. Only the wait's screen
 * shows it.
 */
import type {
  FamilyAskLinkResponse,
  FamilyParentResponse,
  OkResponse,
  PersonView,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import Link from 'lucide-react-native/icons/link';
import Share from 'lucide-react-native/icons/share';
import { useState } from 'react';
import { View } from 'react-native';
// Asked with `api` itself, never Family's `familyApi`: a module the waiting screen and Family
// both imported would sit in the first download.
import { api } from '@/api/client';
import { shareLink } from '@/lib/share';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export function ParentPicker({
  childName,
  linkOpen,
  onAsked,
}: {
  childName: string;
  /** A link they sent is still open: they may make another to send again. */
  linkOpen: boolean;
  onAsked: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [found, setFound] = useState<PersonView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'find' | 'ask' | 'link' | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const find = async () => {
    setBusy('find');
    setError(null);
    setFound(null);
    try {
      setFound(
        (
          await api.get<FamilyParentResponse>(
            `/me/family/parent?handle=${encodeURIComponent(handle.trim())}`,
          )
        ).parent,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const ask = async () => {
    if (!found) return;
    setBusy('ask');
    try {
      await api.post<OkResponse>('/me/family/parent', { handle: found.handle });
      onAsked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const makeLink = async () => {
    setBusy('link');
    setError(null);
    try {
      setUrl((await api.post<FamilyAskLinkResponse>('/me/family/parent-link')).url);
      onAsked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 12 }} testID="parent-picker">
      {found ? (
        <View style={{ gap: 12 }} testID="parent-found">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar id={found.id} name={found.displayName} url={found.avatarUrl} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {found.displayName}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                @{found.handle}
              </Text>
            </View>
          </View>
          <Text variant="bodyStrong">{tr('Is this your parent or guardian?')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              label={tr('Yes, ask them')}
              loading={busy === 'ask'}
              onPress={() => void ask()}
              testID="parent-ask"
            />
            <Button
              label={tr('No')}
              variant="secondary"
              onPress={() => {
                setFound(null);
                setHandle('');
              }}
              testID="parent-not-them"
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Their handle on Caime')}
            value={handle}
            onChangeText={(v) => {
              setHandle(v);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="@"
            error={error ?? undefined}
            onSubmitEditing={() => handle.trim() && void find()}
            testID="parent-handle"
          />
          <Button
            label={tr('Find them')}
            variant="secondary"
            disabled={!handle.trim()}
            loading={busy === 'find'}
            onPress={() => void find()}
            testID="parent-find"
          />
        </View>
      )}
      <View style={{ gap: 8, paddingTop: 8 }}>
        <Text variant="captionStrong" color="textSecondary">
          {tr('Not on Caime yet?')}
        </Text>
        <Text variant="caption" color="textSecondary">
          {tr(
            'Send them a link from your phone. They make their account, then agree to yours. Open for a week.',
          )}
        </Text>
        {url ? (
          <View style={{ gap: 8 }} testID="parent-link-made">
            <CopyRow label={tr('Link')} value={url} testID="parent-link-url" />
            <Button
              label={tr('Share')}
              icon={Share}
              size="sm"
              variant="secondary"
              onPress={() =>
                void shareLink(
                  tr('{name} asks you to agree to their Caime account', { name: childName }),
                  url,
                )
              }
            />
          </View>
        ) : (
          <Button
            label={linkOpen ? tr('Make a new link') : tr('Make a link to send')}
            icon={Link}
            size="sm"
            variant="secondary"
            loading={busy === 'link'}
            onPress={() => void makeLink()}
            testID="parent-link-make"
          />
        )}
      </View>
    </View>
  );
}
