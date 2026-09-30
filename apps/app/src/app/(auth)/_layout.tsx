import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';

export const unstable_settings = { initialRouteName: 'welcome' };

export default function AuthGroup() {
  const t = useTheme();
  // Declared in order: a signed-out visitor to any page lands on the first one, Welcome.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="recover" />
      <Stack.Screen name="forgot" />
      <Stack.Screen name="reset" />
    </Stack>
  );
}
