import { useLocalSearchParams } from 'expo-router';
import { OrgSetupScreen } from '@/features/orgs/OrgSetup';

export default function OrganizationSetup() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <OrgSetupScreen handle={handle} key={handle} />;
}
