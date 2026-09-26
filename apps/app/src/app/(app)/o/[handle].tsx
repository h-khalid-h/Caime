import { useLocalSearchParams } from 'expo-router';
import { OrgScreen } from '@/features/orgs/OrgScreen';

export default function Organization() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <OrgScreen handle={handle} key={handle} />;
}
