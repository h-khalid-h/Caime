import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq, book, order } = useLocalSearchParams<{
    id: string;
    seq?: string;
    book?: string;
    order?: string;
  }>();
  const focusSeq = seq && /^\d+$/.test(seq) ? Number(seq) : undefined;
  // `?book` (R58) and `?order` (R60): opened on that card's form.
  return (
    <ConversationScreen
      id={id}
      focusSeq={focusSeq}
      openKit={book !== undefined ? 'appointment' : order !== undefined ? 'order_status' : null}
      key={`${id}:${seq ?? ''}`}
    />
  );
}
