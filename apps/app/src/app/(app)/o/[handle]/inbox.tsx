import { useLocalSearchParams } from 'expo-router';
import { BusinessInbox } from '@/features/business/BusinessInbox';

export default function OrganizationInbox() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <BusinessInbox handle={handle} key={handle} />;
}
