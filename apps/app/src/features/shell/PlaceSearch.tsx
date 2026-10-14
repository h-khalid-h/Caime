import { tr } from '@caime/core/i18n';
import { CAI_ID } from '@caime/core/system-ids';
import { router } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { View } from 'react-native';
import { useAiStatus } from '@/api/hooks';
import { useMe } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { TextField } from '@/ui/TextField';

/** Cai's mark, as a button's icon. */
function CaiMark({ size = 18 }: { size?: number }) {
  return <Avatar id={CAI_ID} name="Cai" size={size + 2} />;
}

/**
 * A place's own search (R88): what's typed finds in the list shown here, at once and on the
 * device, and the same words can search everything (`/search?q=`) or be asked of Cai
 * (`&ask=1`, where Cai can answer: AI assist on, an adult). It scrolls with the place's list
 * under the head that stays.
 */
export function PlaceSearch({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testID: string;
}) {
  const me = useMe();
  const typed = value.trim();
  // Asked of the server only once something is typed, then kept for ten minutes.
  const ai = useAiStatus(Boolean(typed) && me.aiEnabled && !me.minor);
  const askable = Boolean(ai.data?.available) && me.aiEnabled && !me.minor;
  const go = (ask: boolean) => {
    if (!typed) return;
    router.push({ pathname: '/search', params: ask ? { q: typed, ask: '1' } : { q: typed } });
  };
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
      <TextField
        icon={Search}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
        onSubmitEditing={() => go(false)}
        autoCorrect={false}
        testID={testID}
        trailing={
          value ? (
            <IconButton
              icon={X}
              label={tr('Clear')}
              size={18}
              onPress={() => onChange('')}
              testID={`${testID}-clear`}
            />
          ) : null
        }
      />
      {typed ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label={tr('Search everything')}
            icon={Search}
            size="sm"
            variant="secondary"
            onPress={() => go(false)}
            testID={`${testID}-everything`}
          />
          {askable ? (
            <Button
              label={tr('Ask Cai')}
              icon={CaiMark}
              size="sm"
              variant="secondary"
              onPress={() => go(true)}
              testID={`${testID}-ask`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
