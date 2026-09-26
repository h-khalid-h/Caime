import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen id={id} key={id} />;
}
