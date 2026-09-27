import { useLocalSearchParams } from 'expo-router';
import { CallHistory } from '@/features/calls/history';

/** Call history (PRD §47): `?with=<id>&name=<name>` for the calls with one person. */
export default function Calls() {
  const { with: withId, name } = useLocalSearchParams<{ with?: string; name?: string }>();
  return <CallHistory withId={withId || undefined} withName={name || undefined} />;
}
