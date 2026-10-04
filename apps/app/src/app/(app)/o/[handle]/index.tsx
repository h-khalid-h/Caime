import { useLocalSearchParams } from 'expo-router';
import { OrgScreen } from '@/features/orgs/OrgScreen';

export default function Organization() {
  // `?write` is the organization's door (R53): a customer who comes in through it lands in the
  // conversation, as an invite's guest does.
  const { handle, write } = useLocalSearchParams<{ handle: string; write?: string }>();
  return <OrgScreen handle={handle} write={write !== undefined} key={handle} />;
}
