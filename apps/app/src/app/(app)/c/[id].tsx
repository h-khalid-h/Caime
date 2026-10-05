import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq, book } = useLocalSearchParams<{ id: string; seq?: string; book?: string }>();
  const focusSeq = seq && /^\d+$/.test(seq) ? Number(seq) : undefined;
  // `?book` (R58): opened on the appointment card's form.
  return (
    <ConversationScreen
      id={id}
      focusSeq={focusSeq}
      book={book !== undefined}
      key={`${id}:${seq ?? ''}`}
    />
  );
}
