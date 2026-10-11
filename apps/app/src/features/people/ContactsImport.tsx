/**
 * A contacts file into People (R79): what Google Contacts, iCloud or Outlook exports (vCard or
 * CSV), read on this device. Only the addresses go to the server, to say who's here and
 * findable by address; nothing of the file is kept anywhere. Whoever is here can be asked to
 * connect from the list; the rest get one invite link (R1) to share, and nobody is written to
 * on anyone's behalf.
 */
import type { ContactMatchView, InviteView } from '@caime/core/api';
import {
  CONTACTS_MATCH_MAX,
  type ContactsFile,
  emailsOf,
  parseContacts,
} from '@caime/core/contacts';
import { tr, trn } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openChatWith } from '@/features/inbox/openChat';
import { copyText } from '@/lib/clipboard';
import { shareLink } from '@/lib/share';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const FILE_TYPES = [
  'text/vcard',
  'text/x-vcard',
  'text/directory',
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/*',
];

function MatchRow({ m, onAsked }: { m: ContactMatchView; onAsked: () => void }) {
  const [busy, setBusy] = useState(false);
  const state = m.connection.state;
  const name = m.person.displayName.split(' ')[0] ?? m.person.displayName;
  const ask = async () => {
    setBusy(true);
    try {
      await endpoints.requestConnection({ toUserId: m.person.id, note: null });
      toast(tr('Request sent to {name}', { name }));
      onAsked();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}
      testID={`contacts-match-${m.person.handle}`}
    >
      <Avatar id={m.person.id} name={m.person.displayName} url={m.person.avatarUrl} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {m.person.displayName}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          @{m.person.handle}
        </Text>
      </View>
      {state === 'connected' ? (
        <Button
          label={tr('Message')}
          size="sm"
          variant="secondary"
          onPress={() => void openChatWith({ conversationId: null, person: m.person })}
        />
      ) : state === 'outgoing' ? (
        <Text variant="captionStrong" color="textTertiary">
          {tr('Requested')}
        </Text>
      ) : state === 'incoming' ? (
        <Text variant="captionStrong" color="textTertiary">
          {tr('Asked to connect')}
        </Text>
      ) : (
        <Button
          label={tr('Connect')}
          size="sm"
          loading={busy}
          onPress={() => void ask()}
          testID={`contacts-connect-${m.person.handle}`}
        />
      )}
    </View>
  );
}

export function ContactsImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const { locale } = useUserClock();
  const [file, setFile] = useState<ContactsFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [matches, setMatches] = useState<ContactMatchView[] | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [busy, setBusy] = useState<'find' | 'invite' | null>(null);

  const reset = () => {
    setFile(null);
    setFileName('');
    setMatches(null);
    setAsked(new Set());
    setInvite(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: FILE_TYPES,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;
    try {
      const blob = (asset as { file?: Blob }).file;
      const read = blob ? await blob.text() : await (await fetch(asset.uri)).text();
      const parsed = parseContacts(read);
      if (!parsed.format) {
        toast(
          tr('That isn’t a contacts file. Export one from Google Contacts, iCloud or Outlook.'),
          {
            tone: 'danger',
          },
        );
        return;
      }
      reset();
      setFile(parsed);
      setFileName(asset.name);
    } catch {
      toast(tr('That file couldn’t be read.'), { tone: 'danger' });
    }
  };

  const find = async () => {
    if (!file) return;
    setBusy('find');
    try {
      const emails = emailsOf(file);
      const found: ContactMatchView[] = [];
      for (let i = 0; i < emails.length; i += CONTACTS_MATCH_MAX) {
        const page = await endpoints.matchContacts(emails.slice(i, i + CONTACTS_MATCH_MAX));
        found.push(...page.matches);
      }
      // One row per person, whichever of their addresses was in the file.
      const seen = new Set<string>();
      setMatches(
        found.filter((m) => {
          if (seen.has(m.person.id)) return false;
          seen.add(m.person.id);
          return true;
        }),
      );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const makeInvite = async () => {
    setBusy('invite');
    try {
      const { invite: made } = await endpoints.makeInvite({});
      setInvite(made);
      void qc.invalidateQueries({ queryKey: qk.invites });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const share = (i: InviteView) =>
    void shareLink(
      tr('{displayName} invited you to Caime:', { displayName: me.displayName }),
      i.url,
    );
  const copy = async (i: InviteView) => {
    if (await copyText(i.url)) toast(tr('Link copied'));
    else toast(i.url);
  };

  const withAddress = file ? file.contacts.filter((c) => c.emails.length).length : 0;
  const notHere = matches
    ? Math.max(0, withAddress - new Set(matches.map((m) => m.email)).size)
    : 0;
  const n = (x: number) => x.toLocaleString(locale);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={tr('From your contacts')}
      subtitle={tr('Who’s already here, and a link for the rest.')}
      footer={
        !file ? (
          <Button
            label={tr('Choose the file')}
            block
            size="lg"
            onPress={() => void pick()}
            testID="contacts-pick"
          />
        ) : !matches ? (
          <Button
            label={tr('Find who’s on Caime')}
            block
            size="lg"
            disabled={withAddress === 0}
            loading={busy === 'find'}
            onPress={() => void find()}
            testID="contacts-find"
          />
        ) : (
          <Button label={tr('Done')} block size="lg" onPress={close} testID="contacts-done" />
        )
      }
    >
      <View style={{ gap: 16 }}>
        {!file ? (
          <Text variant="body" color="textSecondary">
            {tr(
              'Export your contacts as a vCard or CSV file (Google Contacts: Export; iCloud: Export vCard; Outlook: Export contacts) and pick it here. It’s read on this device: only the addresses are sent, to see who’s on Caime, and nothing of it is kept.',
            )}
          </Text>
        ) : (
          <View
            style={{
              backgroundColor: t.c.surfaceMuted,
              borderRadius: t.radii.sm,
              padding: 12,
              gap: 4,
            }}
            testID="contacts-summary"
          >
            <Text variant="captionStrong" numberOfLines={1}>
              {fileName}
            </Text>
            <Text variant="caption" color="textSecondary">
              {trn(file.contacts.length, '{n} contact', '{n} contacts')}
              {' · '}
              {withAddress
                ? tr('{n} with an email address', { n: n(withAddress) })
                : tr('none with an email address')}
            </Text>
          </View>
        )}
        {matches ? (
          <View style={{ gap: 8 }}>
            <Text variant="captionStrong" color="textSecondary" testID="contacts-found">
              {matches.length
                ? trn(matches.length, '{n} person is on Caime', '{n} people are on Caime')
                : tr(
                    'Nobody with these addresses is on Caime yet, or they keep their address private.',
                  )}
            </Text>
            {matches.map((m) => (
              <MatchRow
                key={m.person.id}
                m={
                  asked.has(m.person.id)
                    ? { ...m, connection: { ...m.connection, state: 'outgoing' } }
                    : m
                }
                onAsked={() => setAsked((s) => new Set(s).add(m.person.id))}
              />
            ))}
            {notHere ? (
              <View style={{ gap: 8, paddingTop: 8 }}>
                <Text variant="captionStrong" color="textSecondary" testID="contacts-rest">
                  {trn(notHere, '{n} isn’t on Caime yet', '{n} aren’t on Caime yet')}
                </Text>
                {invite ? (
                  <View style={{ gap: 8 }}>
                    <CopyRow
                      label={tr('Invite link')}
                      value={invite.url}
                      testID="contacts-invite-link"
                    />
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      <Button label={tr('Share')} size="sm" onPress={() => share(invite)} />
                      <Button
                        label={tr('Copy')}
                        size="sm"
                        variant="secondary"
                        onPress={() => void copy(invite)}
                      />
                    </View>
                    <Text variant="caption" color="textTertiary">
                      {tr(
                        'Send it yourself, to whoever you like: Caime never writes to anyone for you. Whoever opens it lands connected with you.',
                      )}
                    </Text>
                  </View>
                ) : (
                  <Button
                    label={tr('Make an invite link')}
                    size="sm"
                    variant="secondary"
                    loading={busy === 'invite'}
                    onPress={() => void makeInvite()}
                    testID="contacts-invite"
                  />
                )}
              </View>
            ) : null}
          </View>
        ) : file ? (
          <Button
            label={tr('Choose another file')}
            variant="secondary"
            onPress={() => void pick()}
            testID="contacts-repick"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
