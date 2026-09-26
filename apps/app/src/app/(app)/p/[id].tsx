import { useLocalSearchParams } from 'expo-router';
import { PersonScreen } from '@/features/people/PersonScreen';

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonScreen id={id} key={id} />;
}
