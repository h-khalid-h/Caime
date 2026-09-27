import { router } from 'expo-router';
import { View } from 'react-native';
import { useCallHistory } from '@/api/hooks';
import { Card, Divider } from '@/ui/Card';
import { Phone } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { CallRow } from './CallHistory';

/** On someone's profile: your latest calls with them, and the way to all of them (PRD §47). */
export function PersonCalls({ personId, name }: { personId: string; name: string }) {
  const q = useCallHistory(`with:${personId}`, 3);
  const calls = q.data?.pages[0]?.calls ?? [];
  if (!calls.length) return null;
  return (
    <Card padded={false}>
      <View testID="person-calls">
        {calls.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider inset={72} /> : null}
            <CallRow call={c} />
          </View>
        ))}
        {q.data?.pages[0]?.nextBefore ? (
          <>
            <Divider inset={52} />
            <ListRow
              icon={Phone}
              title={`All calls with ${name}`}
              chevron
              onPress={() =>
                router.navigate({ pathname: '/calls', params: { with: personId, name } })
              }
            />
          </>
        ) : null}
      </View>
    </Card>
  );
}
