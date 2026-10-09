import { tr, trn } from '@caime/core/i18n';
import { IMPORT_MAX_MESSAGES } from '@caime/core/imports';
import { otherAuthor, parseWhatsApp, type WhatsAppChat } from '@caime/core/whatsapp';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Choice } from '@/features/settings/SettingsPage';
import { useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/**
 * Bringing a WhatsApp chat over (R45). The person exports the chat on their phone ("Export
 * chat", without media), picks the file here, says which name in it is theirs, and it lands as
 * a topic with the other person, dated as written, every message marked as imported. The file
 * is read on this device: the server sees the lines, not the file, and only once it's confirmed.
 */
export function WhatsAppImport({
  other,
  onClose,
  onDone,
}: {
  other: { userId: string; name: string };
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
  const [title, setTitle] = useState('WhatsApp');
  const [busy, setBusy] = useState(false);
  const chat: WhatsAppChat | null = text === null ? null : parseWhatsApp(text, { dayFirst });
  // Their own name in the file, if it reads like the one they use here.
  const guess =
    chat && me
      ? (chat.authors.find((a) => a.toLowerCase() === me.displayName.toLowerCase()) ??
        (chat.authors.length === 2
          ? chat.authors.find((a) => a.toLowerCase() !== other.name.toLowerCase())
          : undefined) ??
        null)
      : null;
  const chosen = mine ?? guess;
  const theirs = chat && chosen ? otherAuthor(chat, chosen) : null;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['text/plain', 'text/*'],
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;
    try {
      const blob = (asset as { file?: Blob }).file;
      const read = blob ? await blob.text() : await (await fetch(asset.uri)).text();
      setText(read);
      setFileName(asset.name);
      setMine(null);
    } catch {
      toast(tr('That file couldn’t be read.'), { tone: 'danger' });
    }
  };

  const bring = async () => {
    if (!chat || !chosen) return;
    setBusy(true);
    try {
      const { conversationId, imported } = await endpoints.importChat({
        userId: other.userId,
        source: 'whatsapp',
        title: title.trim() || undefined,
        messages: chat.messages.slice(-IMPORT_MAX_MESSAGES).map((m) => ({
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
  const group = chat ? chat.authors.length > 2 : false;
  const nothing = chat ? chat.messages.length === 0 : false;
  const ready = !!chat && !!chosen && !!theirs && !group && !nothing;

  return (
    <Sheet
      open
      onClose={onClose}
      title={tr('Bring over a WhatsApp chat')}
      subtitle={tr('What you and {name} said there, kept as a topic here. Only you two see it.', {
        name: other.name,
      })}
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
              'In WhatsApp, open the chat, then More › Export chat › Without media. Save the text file somewhere you can pick it from here. Photos and files don’t come along; the words do, dated as they were written.',
            )}
          </Text>
        ) : (
          <>
            <View
              style={{
                backgroundColor: t.c.surfaceMuted,
                borderRadius: 12,
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
            {group ? (
              <Text variant="body" color="danger" testID="import-group">
                {tr(
                  'This export has {length} names in it: it’s a group. Bring over a chat with {name} alone.',
                  { length: chat.authors.length, name: other.name },
                )}
              </Text>
            ) : !nothing ? (
              <>
                <Choice
                  label={tr('Which name is you?')}
                  value={chosen ?? ''}
                  onChange={setMine}
                  options={chat.authors.map((a) => ({
                    value: a,
                    label: a,
                    detail: a === chosen ? tr('You') : tr('{name} here', { name: other.name }),
                  }))}
                />
                {chat.ambiguous ? (
                  <Choice
                    label={tr('How its dates read')}
                    value={chat.dayFirst ? 'day' : 'month'}
                    onChange={(v) => setDayFirst(v === 'day')}
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
