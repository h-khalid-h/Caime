import type { OrgAppSecretsView, OrgAppView, OrgView } from '@caishy/core/api';
import {
  API_SCOPE_LABELS,
  API_SCOPES,
  type ApiScope,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from '@caishy/core/apps';
import { formatListTime } from '@caishy/core/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { Bot, KeyRound, Plus, Trash, Webhook } from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const key = (orgId: string) => ['org-apps', orgId] as const;

function toggled<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const SECRETS_TITLE = 'Copy these now';
const SECRETS_SUBTITLE = 'They won’t be shown again. Put them where your app keeps its settings.';

/**
 * What's shown once: the token and the webhook secret, with how to use them. It takes the place
 * of the sheet's content that asked for it, never a second sheet over the first.
 */
function Secrets({ shown }: { shown: OrgAppSecretsView }) {
  return (
    <View style={{ gap: 12 }}>
      {shown.token ? (
        <>
          <CopyRow label="Token" value={shown.token} testID="org-app-token" />
          <Text variant="caption" color="textSecondary">
            Send it as “Authorization: Bearer” with each request. It acts as{' '}
            {shown.app.bot?.displayName ?? shown.app.name}, and only as far as its permissions.
          </Text>
        </>
      ) : null}
      {shown.webhookSecret ? (
        <>
          <CopyRow label="Webhook secret" value={shown.webhookSecret} testID="org-app-secret" />
          <Text variant="caption" color="textSecondary">
            Each delivery carries a Caishy-Signature header, t=time,v1=signature: the HMAC-SHA256 of
            “time.body” with this secret. Check it, and ignore old times.
          </Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * An organization's apps (PRD §73–75, R16), for its owner and admins: a helpdesk or CRM that
 * hears the inbox, or a bot that answers the simple questions and always says it's automated.
 */
export function OrgApps({ org }: { org: OrgView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const q = useQuery({ queryKey: key(org.id), queryFn: () => endpoints.orgApps(org.id) });
  const apps = q.data?.apps ?? [];
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>(['inbox:read', 'messages:read']);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['business.message']);
  // Kept while its sheet fades, then forgotten: a token lives only as long as it's on screen.
  const [secrets, setSecrets] = useState<OrgAppSecretsView | null>(null);
  const forget = () => setTimeout(() => setSecrets(null), 400);
  const done = (
    <Button
      label="Done"
      block
      size="lg"
      onPress={() => {
        setCreating(false);
        setOpen(null);
        forget();
      }}
      testID="org-app-secrets-done"
    />
  );
  const [open, setOpen] = useState<OrgAppView | null>(null);
  const lastOpen = useRef(open);
  if (open) lastOpen.current = open;
  const app = open ?? lastOpen.current;
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const deliveries = useQuery({
    queryKey: ['app-deliveries', app?.id ?? ''],
    queryFn: () => endpoints.appDeliveries(org.id, app?.id ?? ''),
    enabled: Boolean(open?.webhookUrl),
    refetchInterval: open?.webhookUrl ? 3000 : false,
  });

  const run = async <T,>(work: () => Promise<T>, done?: (r: T) => void) => {
    setBusy(true);
    try {
      const r = await work();
      done?.(r);
      void qc.invalidateQueries({ queryKey: key(org.id) });
      // Its bot joins or leaves the team shown above.
      void qc.invalidateQueries({ queryKey: qk.org(org.handle) });
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    void run(
      () =>
        endpoints.createOrgApp(org.id, {
          name: name.trim(),
          scopes,
          webhookUrl: webhookUrl.trim() || null,
          events: webhookUrl.trim() ? events : [],
        }),
      (r) => {
        setName('');
        setWebhookUrl('');
        setSecrets(r);
      },
    );

  const summary = (a: OrgAppView) =>
    [
      a.scopes.includes('messages:write') ? 'Answers customers' : 'Reads the inbox',
      a.webhookUrl ? `Webhook to ${hostOf(a.webhookUrl)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      <SectionTitle
        action={
          <Button
            label="Add"
            icon={Plus}
            size="sm"
            variant="ghost"
            onPress={() => {
              setSecrets(null);
              setCreating(true);
            }}
            testID="org-app-add"
          />
        }
      >
        Apps
      </SectionTitle>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        {apps.length === 0 ? (
          <Text variant="caption" color="textSecondary" style={{ padding: 14 }}>
            Connect your helpdesk or CRM, or let a bot answer the simple questions. Each app has its
            own token and permissions, and a bot always tells customers it’s automated.
          </Text>
        ) : (
          apps.map((a) => (
            <ListRow
              key={a.id}
              icon={Bot}
              title={a.name}
              subtitle={summary(a)}
              onPress={() => {
                setSecrets(null);
                setOpen(a);
              }}
              testID={`org-app-${a.name}`}
            />
          ))
        )}
      </View>

      <Sheet
        open={creating}
        onClose={() => {
          setCreating(false);
          forget();
        }}
        title={secrets ? SECRETS_TITLE : 'Add an app'}
        subtitle={
          secrets ? SECRETS_SUBTITLE : 'It acts as a bot on the team, only as far as you let it.'
        }
        footer={
          secrets ? (
            done
          ) : (
            <Button
              label="Add the app"
              block
              size="lg"
              disabled={!name.trim() || scopes.length === 0}
              loading={busy}
              onPress={create}
              testID="org-app-create"
            />
          )
        }
      >
        {secrets ? (
          <Secrets shown={secrets} />
        ) : (
          <View style={{ gap: 12 }}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder="Helpdesk, Tiles Assistant…"
              testID="org-app-name"
            />
            <Text variant="captionStrong" color="textSecondary">
              What it may do
            </Text>
            <View style={{ marginHorizontal: -20 }}>
              {API_SCOPES.map((s) => (
                <ListRow
                  key={s}
                  title={API_SCOPE_LABELS[s]}
                  checked={scopes.includes(s)}
                  onPress={() => setScopes((x) => toggled(x, s))}
                  testID={`org-app-scope-${s}`}
                />
              ))}
            </View>
            <TextField
              label="Webhook address (optional)"
              value={webhookUrl}
              onChangeText={setWebhookUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://helpdesk.example/caishy"
              hint="Caishy sends what happens here, signed."
              testID="org-app-webhook"
            />
            {webhookUrl.trim() ? (
              <View style={{ marginHorizontal: -20 }}>
                {WEBHOOK_EVENTS.map((e) => (
                  <ListRow
                    key={e}
                    title={WEBHOOK_EVENT_LABELS[e]}
                    checked={events.includes(e)}
                    onPress={() => setEvents((x) => toggled(x, e))}
                    testID={`org-app-event-${e}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Sheet>

      <Sheet
        open={open !== null}
        onClose={() => {
          setOpen(null);
          setRemoving(false);
          forget();
        }}
        title={secrets ? SECRETS_TITLE : app?.name}
        subtitle={
          secrets
            ? SECRETS_SUBTITLE
            : app?.bot
              ? `Bot · answers as ${org.name}, labelled automated`
              : undefined
        }
        footer={
          secrets ? (
            done
          ) : removing ? (
            <Button
              label="Remove it: its token and webhook stop now"
              variant="danger"
              block
              size="lg"
              loading={busy}
              onPress={() =>
                app &&
                void run(
                  () => endpoints.removeOrgApp(org.id, app.id),
                  () => {
                    setOpen(null);
                    setRemoving(false);
                    toast(`${app.name} removed`);
                  },
                )
              }
              testID="org-app-remove-confirm"
            />
          ) : undefined
        }
      >
        {secrets ? (
          <Secrets shown={secrets} />
        ) : app ? (
          <View style={{ gap: 10 }}>
            <Text variant="caption" color="textSecondary">
              {app.scopes.map((s) => API_SCOPE_LABELS[s]).join(' · ') || 'No permissions'}
            </Text>
            <Text variant="caption" color="textSecondary">
              Token {app.tokenPrefix ?? '—'}…
              {app.lastUsedAt
                ? ` · last used ${formatListTime(app.lastUsedAt, now, timeZone, locale)}`
                : ' · not used yet'}
            </Text>
            <View style={{ marginHorizontal: -20 }}>
              <ListRow
                icon={KeyRound}
                title="Replace the token"
                subtitle="The old one stops at once"
                onPress={() =>
                  void run(
                    () => endpoints.replaceAppToken(org.id, app.id),
                    (r) => setSecrets(r),
                  )
                }
                testID="org-app-new-token"
              />
              {app.webhookUrl ? (
                <>
                  <ListRow
                    icon={Webhook}
                    title="Send a test delivery"
                    subtitle={hostOf(app.webhookUrl) ?? undefined}
                    onPress={() =>
                      void run(
                        () => endpoints.pingApp(org.id, app.id),
                        () => toast('Sent: it shows below in a moment'),
                      )
                    }
                    testID="org-app-ping"
                  />
                  <ListRow
                    icon={KeyRound}
                    title="Replace the webhook secret"
                    onPress={() =>
                      void run(
                        () => endpoints.replaceAppSecret(org.id, app.id),
                        (r) => setSecrets(r),
                      )
                    }
                  />
                </>
              ) : null}
              <ListRow
                icon={Trash}
                title="Remove the app"
                destructive
                onPress={() => setRemoving(true)}
                testID="org-app-remove"
              />
            </View>
            {app.webhookUrl && deliveries.data?.deliveries.length ? (
              <View style={{ gap: 4 }}>
                <Text variant="overline" color="textTertiary">
                  Recent deliveries
                </Text>
                {deliveries.data.deliveries.slice(0, 5).map((d) => (
                  <Text
                    key={d.id}
                    variant="caption"
                    color={d.status === 'failed' ? 'danger' : 'textSecondary'}
                    numberOfLines={1}
                    testID={`delivery-${d.status}`}
                  >
                    {d.event} ·{' '}
                    {d.status === 'delivered'
                      ? `delivered (${d.lastStatus})`
                      : d.status === 'failed'
                        ? `failed: ${d.lastError ?? d.lastStatus}`
                        : d.attempts
                          ? `retrying: ${d.lastError ?? d.lastStatus}`
                          : 'sending'}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
