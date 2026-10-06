import { tr } from '@caime/core/i18n';
import Copy from 'lucide-react-native/icons/copy';
import { View } from 'react-native';
import { copyText } from '@/lib/clipboard';
import { useTheme } from '@/theme/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { toast } from './Toast';

/** A value to copy exactly (a DNS record, a token): shown in full, copied with one tap. */
export function CopyRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingStart: 12,
          borderRadius: 12,
          backgroundColor: t.c.surfaceMuted,
        }}
      >
        <Text
          variant="body"
          selectable
          style={{ flex: 1, fontFamily: 'monospace' }}
          testID={testID}
        >
          {value}
        </Text>
        <IconButton
          icon={Copy}
          label={tr('Copy the {toLowerCase}', { toLowerCase: label.toLowerCase() })}
          onPress={() => void copyText(value).then(() => toast(tr('{label} copied', { label })))}
        />
      </View>
    </View>
  );
}
