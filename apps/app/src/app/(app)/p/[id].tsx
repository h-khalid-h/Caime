import { useLocalSearchParams } from 'expo-router';
import { PersonScreen } from '@/features/people/PersonScreen';

export default function Person() {
  // `?book` (R58): a Book link opens the conversation on the appointment card's form.
  const { id, book, order } = useLocalSearchParams<{ id: string; book?: string; order?: string }>();
  return (
    <PersonScreen
      id={id}
      book={book !== undefined ? 'appointment' : order !== undefined ? 'order_status' : null}
      key={id}
    />
  );
}
