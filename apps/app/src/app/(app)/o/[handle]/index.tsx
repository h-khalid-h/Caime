import { useLocalSearchParams } from 'expo-router';
import { OrgScreen } from '@/features/orgs/OrgScreen';

export default function Organization() {
  // `?write` is the organization's door (R53): a customer who comes in through it lands in the
  // conversation, as an invite's guest does.
  // `?book` (R58) lands on the appointment card's form there.
  const { handle, write, book } = useLocalSearchParams<{
    handle: string;
    write?: string;
    book?: string;
  }>();
  return (
    <OrgScreen handle={handle} write={write !== undefined} book={book !== undefined} key={handle} />
  );
}
