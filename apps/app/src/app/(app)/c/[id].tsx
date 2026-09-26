import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq } = useLocalSearchParams<{ id: string; seq?: string }>();
  const focusSeq = seq && /^\d+$/.test(seq) ? Number(seq) : undefined;
  return <ConversationScreen id={id} focusSeq={focusSeq} key={`${id}:${seq ?? ''}`} />;
}
