import { tr, trn } from '@caime/core/i18n';
import { IMPORT_MAX_MESSAGES } from '@caime/core/imports';
import { otherAuthor, parseWhatsApp, type WhatsAppChat } from '@caime/core/whatsapp';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceList } from '@/ui/ChoiceList';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { chatFromZip, isZipFile } from './chatFile';

/** Where an export comes over: beside a one-to-one, or into a group whoever brings it runs. */
export type ImportInto =
  | { kind: 'direct'; userId: string; name: string }
  | {
      kind: 'group';
      conversationId: string;
      title: string;
      /** Everyone in the group but whoever brings it over. */
      members: Array<{ userId: string; name: string }>;
    };

/** A name kept as itself (nobody here), as the group's "who's who" offers it. */
const KEEP_NAME = 'name';

/**
 * Bringing a WhatsApp chat over (R45). The person exports the chat on their phone ("Export
 * chat", without media: a text file, or on an iPhone a .zip, unzipped here), picks it, says which
 * name in it is theirs, and it lands as a topic with the other person, dated as written, every
 * message marked as imported. A group's export (M16 C3g) comes into a group they run the same way,
 * each other name taken as one of its people (matched by name, changeable) or kept as the name
 * alone. The file is read on this device: the server sees the lines, not the file, and only once
 * it's confirmed.
 */
export function WhatsAppImport({
  into,
  onClose,
  onDone,
}: {
  into: ImportInto;
  onClose: () => void;
  onDone: (conversationId: string) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const { locale } = useUserClock();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [dayFirst, setDayFirst] = useState<boolean | undefined>(undefined);
  const [mine, setMine] = useState<string | null>(null);
  // Who each other name in a group's export is, where it was changed from the match by name.
  const [taken, setTaken] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('WhatsApp');
  const [busy, setBusy] = useState(false);
  const chat: WhatsAppChat | null = text === null ? null : parseWhatsApp(text, { dayFirst });
  const forGroup = into.kind === 'group';
  // Their own name in the file, if it reads like the one they use here.
  const guess =
    chat && me
      ? (chat.authors.find((a) => a.toLowerCase() === me.displayName.toLowerCase()) ??
        (!forGroup && chat.authors.length === 2
          ? chat.authors.find((a) => a.toLowerCase() !== into.name.toLowerCase())
          : undefined) ??
        null)
      : null;
  const chosen = mine ?? guess;
  const theirs = chat && chosen && !forGroup ? otherAuthor(chat, chosen) : null;
  // A group's other names: someone in it whose name reads the same, else the name kept.
  const whoIs = (author: string): string => {
    if (taken[author]) return taken[author];
    if (!forGroup) return KEEP_NAME;
    const same = into.members.find((m) => m.name.toLowerCase() === author.toLowerCase());
    return same?.userId ?? KEEP_NAME;
  };

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['text/plain', 'text/*', 'application/zip', 'application/x-zip-compressed'],
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;
    try {
      const blob = (asset as { file?: Blob }).file;
      const read = isZipFile(asset.name, asset.mimeType)
        ? await chatFromZip(
            new Uint8Array(
              blob ? await blob.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer(),
            ),
          )
        : blob
          ? await blob.text()
          : await (await fetch(asset.uri)).text();
      if (read === null) {
        toast(tr('No chat was found in that file. Is it the exported chat?'), { tone: 'danger' });
        return;
      }
      setText(read);
      setFileName(asset.name);
      setMine(null);
      setTaken({});
    } catch {
      toast(tr('That file couldn’t be read.'), { tone: 'danger' });
    }
  };

  const bring = async () => {
    if (!chat || !chosen || !me) return;
    setBusy(true);
    try {
      const lines = chat.messages.slice(-IMPORT_MAX_MESSAGES);
      const { conversationId, imported } =
        into.kind === 'group'
          ? await endpoints.importGroupChat(into.conversationId, {
              source: 'whatsapp',
              title: title.trim() || undefined,
              authors: chat.authors.map((a) => {
                const who = a === chosen ? me.id : whoIs(a);
                return { name: a, userId: who === KEEP_NAME ? null : who };
              }),
              messages: lines.map((m) => ({
                at: m.at.toISOString(),
                author: chat.authors.indexOf(m.author),
                text: m.text,
              })),
            })
          : await endpoints.importChat({
              userId: into.userId,
              source: 'whatsapp',
              title: title.trim() || undefined,
              messages: lines.map((m) => ({
                at: m.at.toISOString(),
                mine: m.author === chosen,
                text: m.text,
              })),
            });
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast(
        tr('{toLocaleString} messages brought over', {
          toLocaleString: imported.toLocaleString(locale),
        }),
        { tone: 'success' },
      );
      onDone(conversationId);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const days = (d: Date) => d.toLocaleDateString(locale, { dateStyle: 'medium' });
  const first = chat?.messages[0]?.at;
  const last = chat?.messages[chat.messages.length - 1]?.at;
  const group = chat && !forGroup ? chat.authors.length > 2 : false;
  const nothing = chat ? chat.messages.length === 0 : false;
  const ready = !!chat && !!chosen && (forGroup || !!theirs) && !group && !nothing;
  const others = chat && chosen ? chat.authors.filter((a) => a !== chosen) : [];

  return (
    <Sheet
      open
      onClose={onClose}
      title={forGroup ? tr('Bring over a WhatsApp group') : tr('Bring over a WhatsApp chat')}
      subtitle={
        into.kind === 'group'
          ? tr(
              'What was said in the WhatsApp group, kept as a topic of “{title}”. Everyone in it sees it.',
              { title: into.title },
            )
          : tr('What you and {name} said there, kept as a topic here. Only you two see it.', {
              name: into.name,
            })
      }
      footer={
        <Button
          label={chat ? tr('Bring it over') : tr('Choose the file')}
          block
          size="lg"
          disabled={!!chat && !ready}
          loading={busy}
          onPress={() => void (chat ? bring() : pick())}
          testID={chat ? 'import-confirm' : 'import-pick'}
        />
      }
    >
      <View style={{ gap: 16 }}>
        {!chat ? (
          <Text variant="body" color="textSecondary">
            {tr(
              'In WhatsApp, open the chat, then Export chat, without media. A phone saves a text file, an iPhone a .zip: pick either here as it is. Photos and files don’t come along; the words do, dated as they were written.',
            )}
          </Text>
        ) : (
          <>
            <View
              style={{
                backgroundColor: t.c.surfaceMuted,
                borderRadius: t.radii.sm,
                padding: 12,
                gap: 4,
              }}
              testID="import-summary"
            >
              <Text variant="captionStrong" numberOfLines={1}>
                {fileName}
              </Text>
              <Text variant="caption" color="textSecondary">
                {nothing
                  ? tr('No messages were found in it. Is it the exported chat?')
                  : tr('{toLocaleString} messages, {text}{and}', {
                      toLocaleString: chat.messages.length.toLocaleString(locale),
                      text:
                        first && last
                          ? tr('{from} to {to}', { from: days(first), to: days(last) })
                          : '',
                      and:
                        chat.mediaOmitted === 1
                          ? tr(', and a photo or file the export left out')
                          : chat.mediaOmitted
                            ? trn(
                                chat.mediaOmitted,
                                ', and {n} photo or file the export left out',
                                ', and {n} photos or files the export left out',
                              )
                            : '',
                    })}
              </Text>
              {chat.messages.length > IMPORT_MAX_MESSAGES ? (
                <Text variant="caption" color="textSecondary">
                  {tr('The last {n} messages come over.', {
                    n: IMPORT_MAX_MESSAGES.toLocaleString(locale),
                  })}
                </Text>
              ) : null}
            </View>
            {group && into.kind === 'direct' ? (
              <Text variant="body" color="danger" testID="import-group">
                {tr(
                  'This export has {length} names in it: it’s a group. Bring over a chat with {name} alone.',
                  { length: chat.authors.length, name: into.name },
                )}
              </Text>
            ) : !nothing ? (
              <>
                <ChoiceList
                  label={tr('Which name is you?')}
                  value={chosen ?? null}
                  onChange={setMine}
                  testID="import-mine"
                  options={chat.authors.map((a) => ({
                    value: a,
                    label: a,
                    detail:
                      a === chosen
                        ? tr('You')
                        : into.kind === 'direct'
                          ? tr('{name} here', { name: into.name })
                          : undefined,
                  }))}
                />
                {into.kind === 'group' && others.length > 0 ? (
                  <View style={{ gap: 4 }} testID="import-who">
                    <Text variant="overline" color="textSecondary">
                      {tr('Who the others are here')}
                    </Text>
                    {others.map((a, i) => (
                      <ChoiceSheet
                        key={a}
                        label={a}
                        value={whoIs(a)}
                        onChange={(v) => setTaken((was) => ({ ...was, [a]: v }))}
                        options={[
                          ...into.members.map((m) => ({ value: m.userId, label: m.name })),
                          { value: KEEP_NAME, label: tr('Not in this group: keep the name') },
                        ]}
                        testID={`import-who-${i}`}
                      />
                    ))}
                  </View>
                ) : null}
                {chat.ambiguous ? (
                  <ChoiceList
                    label={tr('How its dates read')}
                    value={chat.dayFirst ? 'day' : 'month'}
                    onChange={(v) => setDayFirst(v === 'day')}
                    testID="import-dates"
                    options={[
                      { value: 'day', label: tr('Day first'), detail: '13/03/2024 is 13 March' },
                      {
                        value: 'month',
                        label: tr('Month first'),
                        detail: '03/13/2024 is 13 March',
                      },
                    ]}
                  />
                ) : null}
                <TextField
                  label={tr('Name the topic')}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                  testID="import-title"
                />
              </>
            ) : null}
            <Button
              label={tr('Choose another file')}
              variant="secondary"
              onPress={() => void pick()}
              testID="import-repick"
            />
          </>
        )}
      </View>
    </Sheet>
  );
}
