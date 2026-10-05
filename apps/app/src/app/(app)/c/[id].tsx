import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq, book, order, pay, item } = useLocalSearchParams<{
    id: string;
    seq?: string;
    book?: string;
    order?: string;
    pay?: string;
    item?: string;
  }>();
  const focusSeq = seq && /^\d+$/.test(seq) ? Number(seq) : undefined;
  // `?book` (R58) and `?order` (R60): opened on that card's form; `?item` (R61) chosen in it.
  return (
    <ConversationScreen
      id={id}
      focusSeq={focusSeq}
      openKit={
        book !== undefined
          ? 'appointment'
          : order !== undefined
            ? 'order_status'
            : pay !== undefined
              ? 'payment_request'
              : null
      }
      // `?pay` (R62): the Pay card, paying them.
      kitStart={item ? { itemId: item } : pay !== undefined ? { direction: 'send' } : null}
      key={`${id}:${seq ?? ''}`}
    />
  );
}
