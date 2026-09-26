import Constants from 'expo-constants';
import { View } from 'react-native';
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
  return (
    <SettingsPage title="About Caishy">
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
      <Group>
        <ListRow
          icon={Lock}
          title="Privacy"
          subtitle="How you label people is only ever yours"
          chevron
          onPress={() => openLink('https://caishy.app/privacy')}
        />
        <ListRow
          icon={Info}
          title="Terms"
          chevron
          onPress={() => openLink('https://caishy.app/terms')}
        />
        <ListRow
          icon={Globe}
          title="Help and feedback"
          chevron
          onPress={() => openLink('https://caishy.app/help')}
        />
      </Group>
    </SettingsPage>
  );
}
