/**
 * From your contacts (R89, after R79's file): wherever someone keeps their people, the phone's
 * address book, the browser's contact picker, a Google or Microsoft account, or a file (dropped
 * on a desktop), read on this device and come out as one list. Only its addresses go to the
 * server, to say who's on Caime and findable by address; nothing of it is kept anywhere. Whoever
 * is here is asked to connect, one at a time or all at once; everyone else is invited by the
 * person, one at a time, from their own WhatsApp, messages or mail, with their link in the words
 * (core `contact-invites.ts`). Caime never writes to anyone on anyone's behalf.
 */
import type { ContactAccountView, ContactMatchView } from '@caime/core/api';
import { type InviteWay, inviteWays, toInternational } from '@caime/core/contact-invites';
import {
  AccountReadFailed,
  type ContactAccount,
  type ContactList,
  type ContactReturn,
  type ContactSource,
  contactListOf,
  type RawContact,
  readAccount,
} from '@caime/core/contact-sources';
import { CONTACTS_MATCH_MAX, type Contact, parseContacts } from '@caime/core/contacts';
import { finds } from '@caime/core/fold';
import { tr, trn } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import BookUser from 'lucide-react-native/icons/book-user';
import Contact2 from 'lucide-react-native/icons/contact';
import FileText from 'lucide-react-native/icons/file-text';
import Mail from 'lucide-react-native/icons/mail';
import Search from 'lucide-react-native/icons/search';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openChatWith } from '@/features/inbox/openChat';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { type AccountOutcome, openAccountReturn, startAccount } from './contacts/accounts';
import { useFileDrop } from './contacts/drop';
import { canShareMore, type LocalRead, localSource, readLocal, shareMore } from './contacts/local';
import { doneWithReturn } from './contacts/returned';
import { iosTexts, sendInvite, textsHere } from './contacts/send';

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

/** The accounts by the names people know them by: a provider's own name, never translated. */
const ACCOUNT_NAMES: Record<ContactAccount, string> = { google: 'Google', microsoft: 'Outlook' };
/** How many people to invite are listed before "Show more". */
const INVITE_PAGE = 30;

type Phase =
  | { at: 'choose' }
  | { at: 'reading'; source: ContactSource; count: number }
  | { at: 'denied'; canAskAgain: boolean }
  | {
      at: 'results';
      list: ContactList;
      limited: boolean;
      matches: ContactMatchView[];
      label: string;
    };

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
        <Text variant="bodyStrong" numberOfLines={1} auto>
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

/** Someone to invite, with each way the person can send it from this device. */
function InviteRow({
  c,
  row,
  country,
  ways,
  invited,
  onSend,
}: {
  c: Contact;
  /** The inviter's country, which a national number is dialled from. */
  country: string | null;
  /** Its place in the list as shown. */
  row: number;
  ways: InviteWay[];
  invited: boolean;
  onSend: (way: InviteWay) => void;
}) {
  const t = useTheme();
  const first = c.phones[0];
  const number = first ? (toInternational(first, country) ?? first) : undefined;
  const shown = c.name ?? c.emails[0] ?? number ?? '';
  const detail = c.name ? (number ?? c.emails[0] ?? null) : null;
  const label = { whatsapp: 'WhatsApp', sms: tr('Text'), email: tr('Email') };
  return (
    <View
      style={{
        paddingVertical: 10,
        gap: 8,
        borderTopWidth: row ? 1 : 0,
        borderTopColor: t.c.border,
      }}
      testID={`contacts-invite-row-${row}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar id={shown} name={shown} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1} auto>
            {shown}
          </Text>
          {detail ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        {invited ? (
          <Text variant="captionStrong" color="textTertiary">
            {tr('Invited')}
          </Text>
        ) : null}
      </View>
      {ways.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingStart: 48 }}>
          {ways.map((w) => (
            <Button
              key={w.kind}
              label={label[w.kind]}
              size="sm"
              variant="secondary"
              onPress={() => onSend(w)}
              accessibilityHint={tr('Invite {name}', { name: shown })}
              testID={`contacts-invite-${row}-${w.kind}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ContactsImport({
  open,
  onClose,
  returned = null,
}: {
  open: boolean;
  onClose: () => void;
  /** What the page was opened with after an account's consent, on the web. */
  returned?: ContactReturn | null;
}) {
  const t = useTheme();
  const me = useMe();
  const qc = useQueryClient();
  const { locale } = useUserClock();
  const [phase, setPhase] = useState<Phase>(
    returned ? { at: 'reading', source: returned.account, count: 0 } : { at: 'choose' },
  );
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [term, setTerm] = useState('');
  const [shown, setShown] = useState(INVITE_PAGE);
  const [askingAll, setAskingAll] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const body = useRef<View>(null);
  const n = (x: number) => x.toLocaleString(locale);

  const accounts = useQuery({
    queryKey: qk.contactAccounts,
    queryFn: endpoints.contactAccounts,
    enabled: open,
    staleTime: 10 * 60_000,
  });
  const offered = accounts.data?.accounts ?? [];

  const close = () => {
    doneWithReturn();
    setPhase({ at: 'choose' });
    onClose();
  };

  /** Who of a list is here: its addresses a page at a time, one row per person. */
  const find = useCallback(async (list: ContactList, limited: boolean, label: string) => {
    const emails = [...new Set(list.contacts.flatMap((c) => c.emails))];
    const found: ContactMatchView[] = [];
    try {
      for (let i = 0; i < emails.length; i += CONTACTS_MATCH_MAX)
        found.push(
          ...(await endpoints.matchContacts(emails.slice(i, i + CONTACTS_MATCH_MAX))).matches,
        );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      setPhase({ at: 'choose' });
      return;
    }
    const seen = new Set<string>();
    const matches = found.filter((m) => !seen.has(m.person.id) && Boolean(seen.add(m.person.id)));
    setAsked(new Set());
    setInvited(new Set());
    setTerm('');
    setShown(INVITE_PAGE);
    setPhase({ at: 'results', list, limited, matches, label });
  }, []);

  const fromRaws = useCallback(
    (source: ContactSource, raws: RawContact[], limited: boolean, label: string) => {
      const list = contactListOf(source, raws);
      if (!list.contacts.length) {
        toast(tr('No contacts were found there.'));
        setPhase({ at: 'choose' });
        return;
      }
      return find(list, limited, label);
    },
    [find],
  );

  const localLabel = localSource === 'device' ? tr('Your phone’s contacts') : tr('Your contacts');
  const afterLocal = (read: LocalRead) => {
    if (read.status === 'denied') setPhase({ at: 'denied', canAskAgain: read.canAskAgain });
    else if (read.status === 'cancelled') setPhase({ at: 'choose' });
    else fromRaws(localSource ?? 'picker', read.raws, read.limited, localLabel);
  };
  const fromDevice = async (more = false) => {
    setPhase({ at: 'reading', source: localSource ?? 'picker', count: 0 });
    try {
      afterLocal(more ? await shareMore() : await readLocal());
    } catch {
      toast(tr('Your contacts couldn’t be read.'), { tone: 'danger' });
      setPhase({ at: 'choose' });
    }
  };

  const readFile = useCallback(
    (name: string, text: string) => {
      const parsed = parseContacts(text);
      if (!parsed.format) {
        toast(
          tr('That isn’t a contacts file. Export one from Google Contacts, iCloud or Outlook.'),
          { tone: 'danger' },
        );
        return;
      }
      if (!parsed.contacts.length) {
        toast(tr('No contacts were found there.'));
        return;
      }
      setPhase({ at: 'reading', source: 'file', count: parsed.contacts.length });
      void find({ source: 'file', contacts: parsed.contacts, read: parsed.read }, false, name);
    },
    [find],
  );
  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: FILE_TYPES,
    });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    try {
      const blob = (asset as { file?: Blob }).file;
      readFile(asset.name, blob ? await blob.text() : await (await fetch(asset.uri)).text());
    } catch {
      toast(tr('That file couldn’t be read.'), { tone: 'danger' });
    }
  };
  const dropping = useFileDrop(body, readFile, open && phase.at === 'choose');

  /** An account's contacts, read here with the access its consent gave this device. */
  const fromAccount = useCallback(
    async (outcome: AccountOutcome, api: ContactAccountView | undefined) => {
      const name = ACCOUNT_NAMES[outcome.account];
      if ('cancelled' in outcome) return setPhase({ at: 'choose' });
      if ('error' in outcome || !api) {
        toast(
          'error' in outcome && outcome.error === 'denied'
            ? tr('{account} didn’t let Caime read your contacts.', { account: name })
            : tr('That didn’t work. Try {account} again.', { account: name }),
          { tone: 'danger' },
        );
        return setPhase({ at: 'choose' });
      }
      setPhase({ at: 'reading', source: outcome.account, count: 0 });
      try {
        const read = await readAccount(outcome.account, api.api, outcome.access, fetch, (count) =>
          setPhase({ at: 'reading', source: outcome.account, count }),
        );
        if (!read.read) {
          toast(tr('{account} didn’t let Caime read your contacts.', { account: name }), {
            tone: 'danger',
          });
          return setPhase({ at: 'choose' });
        }
        await fromRaws(outcome.account, read.raws, false, name);
      } catch (e) {
        toast(
          e instanceof AccountReadFailed && e.status === 401
            ? tr('{account} didn’t let Caime read your contacts.', { account: name })
            : tr('{account} couldn’t be reached. Try again.', { account: name }),
          { tone: 'danger' },
        );
        setPhase({ at: 'choose' });
      }
    },
    [fromRaws],
  );

  const fromAccountTap = async (a: ContactAccountView) => {
    setPhase({ at: 'reading', source: a.id, count: 0 });
    try {
      const outcome = await startAccount(a.id);
      // On the web the page has left for the provider, and comes back to this sheet.
      if (outcome !== 'left') await fromAccount(outcome, a);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      setPhase({ at: 'choose' });
    }
  };

  // Back from an account's consent on the web: read it once the accounts are known, and let the
  // return go once it's been read here (a sheet gone first leaves it for the next one).
  const took = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!returned || took.current || !accounts.data) return;
    took.current = true;
    void fromAccount(
      openAccountReturn(returned),
      accounts.data.accounts.find((a) => a.id === returned.account),
    ).finally(() => {
      if (alive.current) doneWithReturn();
    });
  }, [returned, accounts.data, fromAccount]);

  const results = phase.at === 'results' ? phase : null;
  const matchedEmails = useMemo(
    () => new Set(results?.matches.map((m) => m.email) ?? []),
    [results],
  );
  const toInvite = useMemo(() => {
    if (!results) return [];
    return results.list.contacts
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.emails.some((e) => matchedEmails.has(e)))
      .filter(({ c }) => c.emails.length || c.phones.length)
      .sort((a, b) =>
        a.c.name && b.c.name
          ? a.c.name.localeCompare(b.c.name, locale)
          : a.c.name
            ? -1
            : b.c.name
              ? 1
              : 0,
      );
  }, [results, matchedEmails, locale]);
  const listed = term.trim()
    ? toInvite.filter(({ c }) => finds(term, c.name, ...c.emails, ...c.phones))
    : toInvite;

  // The person's own link, made once, before any button needs it: a browser opens WhatsApp in
  // a new tab only inside the tap itself.
  const needsLink = toInvite.length > 0;
  useEffect(() => {
    if (!needsLink || link) return;
    void (async () => {
      try {
        const { invites } = await endpoints.invites();
        const general = invites.find(
          (i) => !i.relationship && !i.note && new Date(i.expiresAt).getTime() > Date.now(),
        );
        if (general) return setLink(general.url);
        const { invite } = await endpoints.makeInvite({});
        setLink(invite.url);
        void qc.invalidateQueries({ queryKey: qk.invites });
      } catch {
        setLink(null);
      }
    })();
  }, [needsLink, link, qc]);

  const words = (c: Contact) => {
    const first = c.name?.split(' ')[0];
    const url = link ?? '';
    return {
      text: first
        ? tr('Hi {first}, I’m on Caime. Join me there: {url}', { first, url })
        : tr('Hi, I’m on Caime. Join me there: {url}', { url }),
      subject: tr('Join me on Caime'),
    };
  };
  const waysFor = (c: Contact) =>
    link
      ? inviteWays(c, words(c), { country: me.country, ios: iosTexts }).filter(
          (w) => w.kind !== 'sms' || textsHere,
        )
      : [];
  const send = async (c: Contact, index: number, way: InviteWay) => {
    try {
      if (await sendInvite(way, words(c).text)) setInvited((s) => new Set(s).add(index));
    } catch {
      toast(tr('That couldn’t be opened here.'), { tone: 'danger' });
    }
  };

  const askable = results?.matches.filter(
    (m) => m.connection.state === 'none' && !asked.has(m.person.id),
  );
  const askAll = async () => {
    if (!askable?.length) return;
    setAskingAll(true);
    let sent = 0;
    for (const m of askable) {
      try {
        await endpoints.requestConnection({ toUserId: m.person.id, note: null });
        sent++;
        setAsked((s) => new Set(s).add(m.person.id));
      } catch (e) {
        toast((e as Error).message, { tone: 'danger' });
        break;
      }
    }
    setAskingAll(false);
    if (sent) toast(trn(sent, 'Request sent to {n} person', 'Requests sent to {n} people'));
  };

  const sources = (
    <View style={{ marginHorizontal: -16 }}>
      {localSource ? (
        <ListRow
          icon={localSource === 'device' ? BookUser : Contact2}
          title={
            localSource === 'device' ? tr('Your phone’s contacts') : tr('Choose from your contacts')
          }
          subtitle={
            localSource === 'device'
              ? tr('Read on this phone')
              : tr('The people you choose, from this phone')
          }
          onPress={() => void fromDevice()}
          chevron
          testID="contacts-source-device"
        />
      ) : null}
      {offered.map((a) => (
        <ListRow
          key={a.id}
          icon={Mail}
          title={ACCOUNT_NAMES[a.id]}
          subtitle={
            a.id === 'google'
              ? tr('Gmail and Google Contacts')
              : tr('Outlook.com, Hotmail and Microsoft 365')
          }
          onPress={() => void fromAccountTap(a)}
          chevron
          testID={`contacts-source-${a.id}`}
        />
      ))}
      <ListRow
        icon={FileText}
        title={tr('A contacts file')}
        subtitle={tr('vCard or CSV, exported from anywhere')}
        onPress={() => void pickFile()}
        chevron
        testID="contacts-source-file"
      />
    </View>
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      title={tr('From your contacts')}
      subtitle={tr('Who’s already here, and a way to invite the rest.')}
      footer={
        results ? (
          <Button label={tr('Done')} block size="lg" onPress={close} testID="contacts-done" />
        ) : undefined
      }
    >
      <View ref={body} style={{ gap: 16 }}>
        {phase.at === 'choose' ? (
          <>
            {sources}
            <View
              style={{
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: dropping ? t.c.primary : 'transparent',
                backgroundColor: dropping ? t.c.surfaceMuted : 'transparent',
                padding: dropping ? 12 : 0,
              }}
              testID="contacts-drop"
            >
              <Text variant="caption" color="textSecondary">
                {dropping
                  ? tr('Drop the file to read it.')
                  : tr(
                      'Read on this device: only email addresses are sent, to see who’s on Caime, and nothing is kept. Whoever isn’t here, you invite yourself.',
                    )}
              </Text>
            </View>
          </>
        ) : phase.at === 'reading' ? (
          <View
            style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}
            testID="contacts-reading"
          >
            <ActivityIndicator color={t.c.primary} />
            <Text variant="body" color="textSecondary" align="center">
              {phase.count
                ? trn(phase.count, '{n} contact read…', '{n} contacts read…')
                : tr('Reading your contacts…')}
            </Text>
          </View>
        ) : phase.at === 'denied' ? (
          <View style={{ gap: 12 }} testID="contacts-denied">
            <Text variant="body" color="textSecondary">
              {tr(
                'Caime can’t see your contacts. Allow it in Settings to find your people, or choose a file instead.',
              )}
            </Text>
            <Button
              label={phase.canAskAgain ? tr('Try again') : tr('Open Settings')}
              onPress={() =>
                phase.canAskAgain ? void fromDevice() : void Linking.openSettings().catch(() => {})
              }
            />
            <Button
              label={tr('Look somewhere else')}
              variant="secondary"
              onPress={() => setPhase({ at: 'choose' })}
            />
          </View>
        ) : results ? (
          <>
            <View
              style={{
                backgroundColor: t.c.surfaceMuted,
                borderRadius: t.radii.sm,
                padding: 12,
                gap: 4,
              }}
              testID="contacts-summary"
            >
              <Text variant="captionStrong" numberOfLines={1} auto>
                {results.label}
              </Text>
              <Text variant="caption" color="textSecondary">
                {trn(results.list.contacts.length, '{n} contact', '{n} contacts')}
                {' · '}
                {trn(results.matches.length, '{n} on Caime', '{n} on Caime')}
              </Text>
              {results.limited && canShareMore ? (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {tr('You shared some of your contacts with Caime.')}
                  </Text>
                  <Button
                    label={tr('Share more')}
                    size="sm"
                    variant="secondary"
                    onPress={() => void fromDevice(true)}
                    testID="contacts-share-more"
                  />
                </View>
              ) : null}
            </View>

            <View>
              <View style={{ marginHorizontal: -16 }}>
                <SectionTitle
                  testID="contacts-found"
                  action={
                    askable && askable.length > 1 ? (
                      <Button
                        label={tr('Connect with all')}
                        size="sm"
                        loading={askingAll}
                        onPress={() => void askAll()}
                        testID="contacts-connect-all"
                      />
                    ) : undefined
                  }
                >
                  {results.matches.length
                    ? trn(
                        results.matches.length,
                        '{n} person is on Caime',
                        '{n} people are on Caime',
                      )
                    : tr('Nobody here yet')}
                </SectionTitle>
              </View>
              {results.matches.length ? (
                results.matches.map((m) => (
                  <MatchRow
                    key={m.person.id}
                    m={
                      asked.has(m.person.id)
                        ? { ...m, connection: { ...m.connection, state: 'outgoing' } }
                        : m
                    }
                    onAsked={() => setAsked((s) => new Set(s).add(m.person.id))}
                  />
                ))
              ) : (
                <Text variant="caption" color="textSecondary" testID="contacts-none-found">
                  {results.list.contacts.some((c) => c.emails.length)
                    ? tr(
                        'Nobody with these addresses is on Caime yet, or they keep their address private.',
                      )
                    : tr(
                        'People are found on Caime by their email address, and none of these contacts has one. Invite them below.',
                      )}
                </Text>
              )}
            </View>

            {toInvite.length ? (
              <View style={{ gap: 8 }}>
                <View style={{ marginHorizontal: -16 }}>
                  <SectionTitle testID="contacts-rest">
                    {trn(toInvite.length, '{n} isn’t on Caime yet', '{n} aren’t on Caime yet')}
                  </SectionTitle>
                </View>
                <Text variant="caption" color="textSecondary">
                  {tr(
                    'Invite them yourself, from your own WhatsApp, messages or mail, with your link in the words. Caime never writes to anyone for you.',
                  )}
                </Text>
                {toInvite.length > 8 ? (
                  <TextField
                    icon={Search}
                    placeholder={tr('Find in your contacts')}
                    value={term}
                    onChangeText={(v) => {
                      setTerm(v);
                      setShown(INVITE_PAGE);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={tr('Find in your contacts')}
                    testID="contacts-invite-search"
                  />
                ) : null}
                <View>
                  {listed.slice(0, shown).map(({ c, i }, row) => (
                    <InviteRow
                      key={i}
                      c={c}
                      row={row}
                      country={me.country}
                      ways={waysFor(c)}
                      invited={invited.has(i)}
                      onSend={(w) => void send(c, i, w)}
                    />
                  ))}
                </View>
                {listed.length > shown ? (
                  <Button
                    label={tr('Show {n} more', {
                      n: n(Math.min(INVITE_PAGE, listed.length - shown)),
                    })}
                    variant="secondary"
                    size="sm"
                    onPress={() => setShown((s) => s + INVITE_PAGE)}
                    testID="contacts-invite-more"
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              label={tr('Look somewhere else')}
              variant="ghost"
              onPress={() => setPhase({ at: 'choose' })}
              testID="contacts-again"
            />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
