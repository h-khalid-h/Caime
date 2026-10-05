import { useLocalSearchParams } from 'expo-router';
import { PersonScreen } from '@/features/people/PersonScreen';

export default function Person() {
  // `?book` (R58): a Book link opens the conversation on the appointment card's form; `?item`
  // (R61) is one of their items or collections, by address, shown over the page.
  const { id, book, order, item } = useLocalSearchParams<{
    id: string;
    book?: string;
    order?: string;
    item?: string;
  }>();
  return (
    <PersonScreen
      id={id}
      book={book !== undefined ? 'appointment' : order !== undefined ? 'order_status' : null}
      slug={item ? item.toLowerCase() : null}
      key={id}
    />
  );
}
