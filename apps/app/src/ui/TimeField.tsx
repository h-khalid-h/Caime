/**
 * A time of day, on a phone: the phone's own time picker (Android's clock, in the 12 or 24 hours
 * the person's language uses; iOS's wheels, in a sheet with Done), shown as the language says it.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { Clock } from './icons';
import { Pressable } from './Pressable';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { formatTime, type TimeFieldProps, timeDate, timeOf, uses24Hours } from './times';

export function TimeField({ label, value, onChange, hint, error, testID }: TimeFieldProps) {
  const t = useTheme();
  // As the person writes dates and times (Language and region), not the device.
  const { locale } = useUserClock();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => timeDate(value));
  const shown = formatTime(value, locale);
  const choose = () => {
    if (Platform.OS === 'android') {
      // The system's own clock, which works with the app's theme (Material 3's needs its own).
      DateTimePickerAndroid.open({
        value: timeDate(value),
        mode: 'time',
        design: 'default',
        is24Hour: uses24Hours(locale),
        onValueChange: (_, date) => onChange(timeOf(date)),
      });
      return;
    }
    setDraft(timeDate(value));
    setOpen(true);
  };
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}`}
        accessibilityHint="Opens a time picker"
        onPress={choose}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minHeight: 48,
          borderRadius: t.radii.md,
          borderWidth: error ? 2 : 1,
          borderColor: error ? t.c.danger : t.c.border,
          backgroundColor: t.c.surface,
          paddingHorizontal: error ? 13 : 14,
        }}
      >
        <Text variant="body">{shown}</Text>
        <Clock size={18} color={t.c.textSecondary} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          scroll={false}
          footer={
            <Button
              label="Done"
              size="lg"
              block
              onPress={() => {
                onChange(timeOf(draft));
                setOpen(false);
              }}
              testID={testID ? `${testID}-done` : undefined}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
            locale={locale}
            themeVariant={t.scheme}
            onValueChange={(_, date) => setDraft(date)}
            style={{ alignSelf: 'center' }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}
