import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq, book, order, item } = useLocalSearchParams<{
    id: string;
    seq?: string;
    book?: string;
    order?: string;
    item?: string;
  }>();
  const focusSeq = seq && /^\d+$/.test(seq) ? Number(seq) : undefined;
  // `?book` (R58) and `?order` (R60): opened on that card's form; `?item` (R61) chosen in it.
  return (
    <ConversationScreen
      id={id}
      focusSeq={focusSeq}
      openKit={book !== undefined ? 'appointment' : order !== undefined ? 'order_status' : null}
      kitStart={item ? { itemId: item } : null}
      key={`${id}:${seq ?? ''}`}
    />
  );
}
