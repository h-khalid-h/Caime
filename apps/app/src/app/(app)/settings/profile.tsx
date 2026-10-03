import { msg, tr } from '@caime/core/i18n';
import { displayNameError, handleError, normalizeHandle } from '@caime/core/rules';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { uploadFile } from '@/api/upload';
import { PresenceChoice } from '@/features/settings/PresenceChoice';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { AVATAR_MAX_EDGE } from '@/lib/photoSize';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { formatDay } from '@/ui/dates';
import { EmojiSheet } from '@/ui/EmojiSheet';
import { AtSign, Camera } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];
/** Statuses people set most, a tap each: the emoji and the words together. */
const STATUSES: Array<{ emoji: string; text: string }> = [
  { emoji: '📅', text: msg('In a meeting') },
  { emoji: '🚌', text: msg('On my way') },
  { emoji: '🎯', text: 'Focusing' },
  { emoji: '🏠', text: msg('Working from home') },
  { emoji: '🤒', text: msg('Off sick') },
  { emoji: '🌴', text: msg('On holiday') },
];
type Presence = 'auto' | 'available' | 'busy' | 'away' | 'invisible';

export default function Profile() {
  const me = useMe();
  const t = useTheme();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio ?? '');
  const [pronouns, setPronouns] = useState(me.pronouns ?? '');
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? '');
  const [statusText, setStatusText] = useState(me.statusText ?? '');
  const [presence, setPresence] = useState<Presence>(me.presence);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const save = async () => {
    const next: Record<string, string> = {};
    const n = displayNameError(displayName);
    if (n) next.displayName = n;
    const h = handleError(handle);
    if (h) next.handle = h;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await endpoints.updateMe({
        displayName: displayName.trim(),
        ...(normalizeHandle(handle) !== me.handle ? { handle: normalizeHandle(handle) } : {}),
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
      });
      useSession.getState().setUser(res.user);
      toast(tr('Saved'));
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors());
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  // Status and presence take effect as they're chosen, here as in the You sheet.
  const [choosingEmoji, setChoosingEmoji] = useState(false);
  const saveStatus = async (emoji: string, text: string) => {
    setStatusEmoji(emoji);
    setStatusText(text);
    try {
      const res = await endpoints.updateMe({
        statusEmoji: emoji || null,
        statusText: text.trim() || null,
      });
      useSession.getState().setUser(res.user);
      toast(emoji || text.trim() ? tr('Status set') : tr('Status cleared'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const choosePresence = async (next: Presence) => {
    const was = presence;
    setPresence(next);
    try {
      const res = await endpoints.updateMe({ presence: next });
      useSession.getState().setUser(res.user);
    } catch (e) {
      setPresence(was);
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  const changePhoto = async () => {
    const res = await pickFromLibrary({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPhotoBusy(true);
    try {
      const file = await uploadFile(await photoToUpload(a, 'avatar.jpg', AVATAR_MAX_EDGE));
      const updated = await endpoints.updateMe({ avatarFileId: file.id });
      useSession.getState().setUser(updated.user);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <SettingsPage title={tr('Profile')}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar id={me.id} name={displayName || me.displayName} url={me.avatarUrl} size={96} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={me.avatarUrl ? tr('Change photo') : tr('Add a photo')}
            icon={Camera}
            variant="secondary"
            size="sm"
            onPress={changePhoto}
            loading={photoBusy}
          />
          {me.avatarUrl ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              size="sm"
              onPress={async () => {
                const res = await endpoints.updateMe({ avatarFileId: null });
                useSession.getState().setUser(res.user);
              }}
            />
          ) : null}
        </View>
        <Text variant="caption" color="textTertiary" align="center">
          {tr('Who sees your photo is up to you, under Privacy.')}
        </Text>
      </View>
      <Group>
        <View style={{ padding: 16, gap: 14 }}>
          <TextField
            label={tr('Name')}
            value={displayName}
            onChangeText={setDisplayName}
            error={errors.displayName}
            autoCapitalize="words"
          />
          <TextField
            label={tr('Handle')}
            icon={AtSign}
            value={handle}
            onChangeText={(v) => setHandle(v.replace(/\s/g, ''))}
            error={errors.handle}
            hint={tr('Change it, and nobody can take your old one for a year, you included.')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ gap: 8 }}>
            <TextField
              label={tr('Pronouns (optional)')}
              value={pronouns}
              onChangeText={setPronouns}
              maxLength={40}
              placeholder={tr('Anything you like')}
            />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {PRONOUNS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  size="sm"
                  selected={pronouns === p}
                  onPress={() => setPronouns(pronouns === p ? '' : p)}
                />
              ))}
            </View>
          </View>
          <TextField
            label={tr('About you (optional)')}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={280}
            hint={tr('{n} left', { n: 280 - bio.length })}
          />
        </View>
      </Group>
      {me.birthDate ? (
        <Group
          title={tr('Date of birth')}
          footer={tr(
            'Only to keep younger people safer, and never shown to anyone. If it’s wrong, Help says how to correct it. Your country and time zone are in Language and region.',
          )}
        >
          <View style={{ padding: 16 }}>
            <Text variant="body" testID="profile-birth-date">
              {formatDay(me.birthDate, me.locale)}
            </Text>
          </View>
        </Group>
      ) : null}
      <Group title={tr('Status')}>
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ gap: 6 }}>
              <Text variant="captionStrong" color="textSecondary">
                {tr('Emoji')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('Status emoji, {statusEmoji}', {
                  statusEmoji: statusEmoji || 'none',
                })}
                accessibilityHint={tr('Opens the emoji to choose from')}
                onPress={() => setChoosingEmoji(true)}
                testID="status-emoji"
                style={{
                  width: 56,
                  height: 48,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: t.c.border,
                  backgroundColor: t.c.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, lineHeight: 28 }} maxFontSizeMultiplier={1}>
                  {statusEmoji || '🙂'}
                </Text>
              </Pressable>
            </View>
            <TextField
              label={tr('What’s up?')}
              value={statusText}
              onChangeText={setStatusText}
              // Set once it's written: on leaving the field, or with the keyboard's Done.
              onBlur={() => {
                if (statusText.trim() !== (me.statusText ?? ''))
                  void saveStatus(statusEmoji, statusText);
              }}
              onSubmitEditing={() => void saveStatus(statusEmoji, statusText)}
              returnKeyType="done"
              maxLength={80}
              style={{ flex: 1 }}
              placeholder={tr('On holiday until the 12th')}
              testID="status-text"
            />
          </View>
          <EmojiSheet
            open={choosingEmoji}
            onClose={() => setChoosingEmoji(false)}
            title={tr('Status emoji')}
            value={statusEmoji || null}
            onPick={(emoji) => void saveStatus(emoji ?? '', statusText)}
            testID="status-emoji-sheet"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.map((st) => {
              const on = statusEmoji === st.emoji && statusText === st.text;
              return (
                <Chip
                  key={tr(st.text)}
                  label={`${st.emoji} ${tr(st.text)}`}
                  size="sm"
                  selected={on}
                  accessibilityLabel={tr(st.text)}
                  onPress={() => void (on ? saveStatus('', '') : saveStatus(st.emoji, st.text))}
                />
              );
            })}
            {statusEmoji || statusText ? (
              <Chip label={tr('Clear')} size="sm" onPress={() => void saveStatus('', '')} />
            ) : null}
          </View>
        </View>
      </Group>
      <Group
        title={tr('Presence')}
        footer={tr(
          'Invisible hides when you’re online and when you were last active, from everyone.',
        )}
      >
        <PresenceChoice
          value={presence === 'available' ? 'auto' : presence}
          onChange={(v) => void choosePresence(v)}
        />
      </Group>
      <Button label={tr('Save changes')} size="lg" block onPress={save} loading={busy} />
    </SettingsPage>
  );
}
