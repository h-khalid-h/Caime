import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';

/** A meeting's guest (R84), signed in for that meeting alone: one screen that takes them to it. */
export default function GuestGroup() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
      <Stack.Screen name="meeting" />
    </Stack>
  );
}
