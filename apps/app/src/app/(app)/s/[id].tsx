import { useLocalSearchParams } from 'expo-router';
import { SpaceScreen } from '@/features/spaces/SpaceScreen';

export default function Space() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpaceScreen id={id} key={id} />;
}
