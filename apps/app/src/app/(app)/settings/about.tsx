import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Character } from '@/brand/Character';
import { Wordmark } from '@/brand/Wordmark';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { openLink } from '@/lib/links';
import { useTheme } from '@/theme/theme';
import { Globe, Info, Lock } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';

export default function About() {
  const t = useTheme();
  // Where this Caime keeps its policies and help: the server's to say (its environment), so a
  // link goes where its operator put it, and there's none for what they haven't.
  const links = useQuery({
    queryKey: qk.about,
    queryFn: endpoints.about,
    staleTime: 3_600_000,
  }).data;
  return (
    <SettingsPage title="About Caime">
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
        {t.playful ? <Character name="caishy" size={120} /> : null}
        <Wordmark height={34} />
        <Text variant="body" color="textSecondary" align="center">
          Messaging that understands your relationships.
        </Text>
        <Text variant="caption" color="textTertiary">
          Version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </View>
      {links?.privacyUrl || links?.termsUrl || links?.helpUrl ? (
        <Group>
          {links.privacyUrl ? (
            <ListRow
              icon={Lock}
              title="Privacy"
              subtitle="How you label people is only ever yours"
              chevron
              onPress={() => openLink(links.privacyUrl ?? '')}
              testID="about-privacy"
            />
          ) : null}
          {links.termsUrl ? (
            <ListRow
              icon={Info}
              title="Terms"
              chevron
              onPress={() => openLink(links.termsUrl ?? '')}
              testID="about-terms"
            />
          ) : null}
          {links.helpUrl ? (
            <ListRow
              icon={Globe}
              title="Help and feedback"
              chevron
              onPress={() => openLink(links.helpUrl ?? '')}
              testID="about-help"
            />
          ) : null}
        </Group>
      ) : null}
    </SettingsPage>
  );
}
