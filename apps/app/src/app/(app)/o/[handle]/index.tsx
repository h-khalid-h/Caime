import { useLocalSearchParams } from 'expo-router';
import { OrgScreen } from '@/features/orgs/OrgScreen';

export default function Organization() {
  // `?write` is the organization's door (R53): a customer who comes in through it lands in the
  // conversation, as an invite's guest does.
  // `?book` (R58) lands on the appointment card's form there.
  // `?item` (R61) is one of its items or collections, by address: its sheet over the page.
  const { handle, write, book, order, item } = useLocalSearchParams<{
    handle: string;
    write?: string;
    book?: string;
    order?: string;
    item?: string;
  }>();
  return (
    <OrgScreen
      handle={handle}
      write={write !== undefined}
      book={book !== undefined ? 'appointment' : order !== undefined ? 'order_status' : null}
      slug={item ? item.toLowerCase() : null}
      key={handle}
    />
  );
}
