import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/features/conversation/ConversationScreen';

export default function Conversation() {
  const { id, seq, book, order, pay, item, checkout, say } = useLocalSearchParams<{
    id: string;
    seq?: string;
    book?: string;
    order?: string;
    pay?: string;
    item?: string;
    checkout?: string;
    say?: string;
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
      // `?checkout` (R65): back from paying a Pay card by card.
      checkout={checkout && /^[0-9a-f-]{36}$/i.test(checkout) ? checkout : null}
      // `?say` (R68): Cai's follow-up, in the composer to change before sending.
      say={say ? say.slice(0, 1000) : null}
      key={`${id}:${seq ?? ''}`}
    />
  );
}
