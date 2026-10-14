import { useLocalSearchParams } from 'expo-router';
import { JoinMeeting } from '@/features/meetings/JoinMeeting';

/**
 * A meeting guest's own link (R84): open to anyone, signed in or not, since it's how a guest
 * arrives and, once they've joined, where their meeting is.
 */
export default function JoinRoute() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  return <JoinMeeting token={token} />;
}
