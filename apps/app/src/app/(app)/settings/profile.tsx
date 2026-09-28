import { displayNameError, handleError, normalizeHandle } from '@caishy/core/rules';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { uploadFile } from '@/api/upload';
import { CountryField } from '@/features/geo/CountryField';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { pickFromLibrary } from '@/lib/photos';
import { useMe, useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { formatDay } from '@/ui/dates';
import { AtSign, Camera } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];
type Presence = 'auto' | 'available' | 'busy' | 'away' | 'invisible';

export default function Profile() {
  const me = useMe();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio ?? '');
  const [pronouns, setPronouns] = useState(me.pronouns ?? '');
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? '');
  const [statusText, setStatusText] = useState(me.statusText ?? '');
  const [presence, setPresence] = useState<Presence>(me.presence);
  const [country, setCountry] = useState<string | null>(me.country);
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
        statusText: statusText.trim() || null,
        statusEmoji: statusEmoji.trim() || null,
        presence,
        ...(country && country !== me.country ? { country } : {}),
      });
      useSession.getState().setUser(res.user);
      toast('Saved');
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors());
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
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
      const file = await uploadFile({
        uri: a.uri,
        name: a.fileName ?? 'avatar.jpg',
        mime: a.mimeType ?? 'image/jpeg',
        file: (a as { file?: Blob }).file,
      });
      const updated = await endpoints.updateMe({ avatarFileId: file.id });
      useSession.getState().setUser(updated.user);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <SettingsPage title="Profile">
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar id={me.id} name={displayName || me.displayName} url={me.avatarUrl} size={96} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={me.avatarUrl ? 'Change photo' : 'Add a photo'}
            icon={Camera}
            variant="secondary"
            size="sm"
            onPress={changePhoto}
            loading={photoBusy}
          />
          {me.avatarUrl ? (
            <Button
              label="Remove"
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
          Who sees your photo is up to you, under Privacy.
        </Text>
      </View>
      <Group>
        <View style={{ padding: 16, gap: 14 }}>
          <TextField
            label="Name"
            value={displayName}
            onChangeText={setDisplayName}
            error={errors.displayName}
            autoCapitalize="words"
          />
          <TextField
            label="Handle"
            icon={AtSign}
            value={handle}
            onChangeText={(v) => setHandle(v.replace(/\s/g, ''))}
            error={errors.handle}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ gap: 8 }}>
            <TextField
              label="Pronouns (optional)"
              value={pronouns}
              onChangeText={setPronouns}
              maxLength={40}
              placeholder="Anything you like"
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
            label="About you (optional)"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={280}
            hint={`${280 - bio.length} left`}
          />
        </View>
      </Group>
      <Group
        title="Where you live"
        footer="Your country sets your defaults: the days work notifications wait for, and the currency of amounts. Neither is shown to anyone."
      >
        <View style={{ padding: 16, gap: 14 }}>
          <CountryField
            label="Country"
            value={country}
            onChange={setCountry}
            locale={me.locale}
            testID="profile-country"
          />
          {me.birthDate ? (
            <View style={{ gap: 4 }}>
              <Text variant="captionStrong" color="textSecondary">
                Date of birth
              </Text>
              <Text variant="body" testID="profile-birth-date">
                {formatDay(me.birthDate, me.locale)}
              </Text>
              <Text variant="caption" color="textTertiary">
                Only to keep younger people safer. If it’s wrong, Help says how to correct it.
              </Text>
            </View>
          ) : null}
        </View>
      </Group>
      <Group title="Status">
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextField
              label="Emoji"
              value={statusEmoji}
              onChangeText={(v) => setStatusEmoji(v.slice(0, 4))}
              style={{ width: 84 }}
              placeholder="🌴"
            />
            <TextField
              label="What’s up?"
              value={statusText}
              onChangeText={setStatusText}
              maxLength={80}
              style={{ flex: 1 }}
              placeholder="On holiday until the 12th"
            />
          </View>
        </View>
      </Group>
      <Group
        title="Presence"
        footer="Invisible hides when you’re online and when you were last active, from everyone."
      >
        <Choice<Presence>
          label="Presence"
          value={presence}
          onChange={setPresence}
          options={[
            { value: 'auto', label: 'Automatic', detail: 'Online while you use Caishy' },
            { value: 'busy', label: 'Busy' },
            { value: 'away', label: 'Away' },
            { value: 'invisible', label: 'Invisible' },
          ]}
        />
      </Group>
      <Button label="Save changes" size="lg" block onPress={save} loading={busy} />
    </SettingsPage>
  );
}
