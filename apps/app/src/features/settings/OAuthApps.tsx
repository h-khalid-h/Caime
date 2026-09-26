import type { OAuthAppView } from '@caishy/core/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { WEB_URL } from '@/lib/config';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { LayoutGrid, Plus, Trash } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { Group } from './SettingsPage';

type Kind = 'public' | 'confidential';
const KINDS = [
  { value: 'public', label: 'Phones and browsers' },
  { value: 'confidential', label: 'Its own server' },
] as const;

const DISCOVERY_URL = `${WEB_URL}/.well-known/oauth-authorization-server`;
const AUTHORIZE_URL = `${WEB_URL}/oauth/authorize`;
const TOKEN_URL = `${WEB_URL}/v1/oauth/token`;

const kindLine = (a: OAuthAppView) =>
  a.confidential
    ? 'This app sends its secret with the verifier when it trades a code.'
    : 'This app proves itself with PKCE alone.';

/** How to send people to it, and trade what comes back: the same for every app. */
function Addresses({ app }: { app: OAuthAppView }) {
  return (
    <View style={{ gap: 12 }}>
      <CopyRow label="Client ID" value={app.clientId} testID="oauth-app-client-id" />
      <CopyRow label="Discovery address" value={DISCOVERY_URL} />
      <Text variant="caption" color="textSecondary">
        {`Most OAuth libraries need only these two. Otherwise, send people to the authorization address with response_type=code, the client ID, a return address below, the scopes it needs and an S256 code challenge, then trade the code that comes back, with the verifier, at the token address. ${kindLine(app)}`}
      </Text>
      <CopyRow label="Authorization address" value={AUTHORIZE_URL} />
      <CopyRow label="Token address" value={TOKEN_URL} />
      <View style={{ gap: 4 }}>
        <Text variant="captionStrong" color="textSecondary">
          Return addresses
        </Text>
        {app.redirectUris.map((u) => (
          <Text key={u} variant="caption" selectable style={{ fontFamily: 'monospace' }}>
            {u}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Apps a developer registers (PRD §74) so other people can let them act for them, through
 * OAuth: whoever lets one in sees its name, who made it and what it wants, and nothing more.
 */
export function OAuthApps() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.oauthApps, queryFn: endpoints.oauthApps });
  const apps = q.data?.apps ?? [];
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [redirects, setRedirects] = useState('');
  const [kind, setKind] = useState<Kind>('public');
  // Each field's own refusal under it; anything else under the form.
  const [errors, setErrors] = useState<{
    name?: string;
    website?: string;
    redirects?: string;
    form?: string;
  }>({});
  // The secret lives only as long as it's on screen, and fades with its sheet.
  const [made, setMade] = useState<{ app: OAuthAppView; clientSecret: string | null } | null>(null);
  const [open, setOpen] = useState<OAuthAppView | null>(null);
  const lastOpen = useRef(open);
  if (open) lastOpen.current = open;
  const shown = open ?? lastOpen.current;
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const closeNew = () => {
    setMaking(false);
    setTimeout(() => {
      setMade(null);
      setName('');
      setWebsite('');
      setRedirects('');
      setKind('public');
      setErrors({});
    }, 400);
  };
  const create = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await endpoints.createOAuthApp({
        name: name.trim(),
        ...(website.trim() ? { website: website.trim() } : {}),
        redirectUris: redirects
          .split(/\s+/)
          .map((u) => u.trim())
          .filter(Boolean),
        confidential: kind === 'confidential',
      });
      setMade(r);
      void qc.invalidateQueries({ queryKey: qk.oauthApps });
    } catch (e) {
      const fields = e instanceof ApiError ? e.fieldErrors() : {};
      // redirectUris.2 is the third address: it's still the addresses field.
      const at = (key: string) =>
        Object.entries(fields).find(([path]) => path === key || path.startsWith(`${key}.`))?.[1];
      const mapped = { name: at('name'), website: at('website'), redirects: at('redirectUris') };
      setErrors(
        mapped.name || mapped.website || mapped.redirects ? mapped : { form: (e as Error).message },
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (app: OAuthAppView) => {
    setBusy(true);
    try {
      await endpoints.removeOAuthApp(app.id);
      void qc.invalidateQueries({ queryKey: qk.oauthApps });
      setOpen(null);
      setRemoving(false);
      toast(`${app.name} removed: it can’t act for anyone now`);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Group
        title="Your apps"
        footer="Register an app other people can let act for them. They see its name, who made it and what it wants before they choose, and can end it any time."
      >
        {q.isPending ? (
          <SkeletonRows />
        ) : (
          apps.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={LayoutGrid}
                title={a.name}
                subtitle={`${a.clientId} · ${a.confidential ? 'its own server' : 'phones and browsers'}`}
                chevron
                onPress={() => {
                  setRemoving(false);
                  setOpen(a);
                }}
                testID={`oauth-app-${a.name}`}
              />
            </View>
          ))
        )}
        {apps.length ? <Divider /> : null}
        <ListRow
          icon={Plus}
          title="Register an app"
          subtitle={apps.length ? undefined : 'Sign in with Caishy, for people who use it'}
          onPress={() => setMaking(true)}
          testID="oauth-app-new"
        />
      </Group>

      <Sheet
        open={making}
        onClose={closeNew}
        title={made ? 'Your app is registered' : 'Register an app'}
        subtitle={
          made?.clientSecret
            ? 'Copy the secret now: it won’t be shown again.'
            : made
              ? undefined
              : 'People who let it in see these, so make them recognisable.'
        }
        footer={
          made ? (
            <Button label="Done" block size="lg" onPress={closeNew} testID="oauth-app-done" />
          ) : (
            <Button
              label="Register the app"
              block
              size="lg"
              loading={busy}
              disabled={!name.trim() || !redirects.trim()}
              onPress={() => void create()}
              testID="oauth-app-create"
            />
          )
        }
      >
        {made ? (
          <View style={{ gap: 12 }}>
            {made.clientSecret ? (
              <>
                <CopyRow
                  label="Client secret"
                  value={made.clientSecret}
                  testID="oauth-app-secret"
                />
                <Text variant="caption" color="textSecondary">
                  Keep it on your server, never in an app people download. Send it with the client
                  ID when you trade a code.
                </Text>
              </>
            ) : null}
            <Addresses app={made.app} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder="Weekly digest"
              error={errors.name}
              testID="oauth-app-name"
            />
            <TextField
              label="Website (optional)"
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://digest.example"
              error={errors.website}
              testID="oauth-app-website"
            />
            <TextField
              label="Return addresses"
              value={redirects}
              onChangeText={setRedirects}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              placeholder="https://digest.example/callback"
              hint="Where people go back to after choosing, one per line: https, http://localhost while you build it, or your app’s own scheme."
              error={errors.redirects}
              testID="oauth-app-redirects"
            />
            <Segmented
              label="Where it runs"
              value={kind}
              onChange={setKind}
              options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
            <Text variant="caption" color="textTertiary">
              {kind === 'public'
                ? 'An app on a phone or in a browser can’t keep a secret, so it proves itself with PKCE each time.'
                : 'A server keeps a secret. It gets one, and sends it with PKCE when it trades a code.'}
            </Text>
            {errors.form ? (
              <Text
                variant="bodyStrong"
                color="danger"
                accessibilityLiveRegion="assertive"
                testID="oauth-app-error"
              >
                {errors.form}
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>

      <Sheet
        open={open !== null}
        onClose={() => {
          setOpen(null);
          setRemoving(false);
        }}
        title={shown?.name}
        subtitle={shown?.website ?? undefined}
        footer={
          removing && shown ? (
            <Button
              label="Remove it: it stops for everyone at once"
              variant="danger"
              block
              size="lg"
              loading={busy}
              onPress={() => void remove(shown)}
              testID="oauth-app-remove-confirm"
            />
          ) : undefined
        }
      >
        {shown ? (
          <View style={{ gap: 12 }}>
            <Addresses app={shown} />
            <View style={{ marginHorizontal: -20 }}>
              <ListRow
                icon={Trash}
                title="Remove the app"
                subtitle="Everyone who let it in is signed out of it"
                destructive
                onPress={() => setRemoving(true)}
                testID="oauth-app-remove"
              />
            </View>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
