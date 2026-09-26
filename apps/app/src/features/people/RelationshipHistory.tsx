import { formatDayHeading } from '@caishy/core/format';
import { describeRelationshipEvent } from '@caishy/core/history';
import { useState } from 'react';
import { View } from 'react-native';
import { useRelationshipHistory } from '@/api/hooks';
import { useNow, useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';

const FIRST = 4;

/** How you've known someone over time, newest first. Like the labels, only you see it. */
export function RelationshipHistory({ personId, name }: { personId: string; name: string }) {
  const q = useRelationshipHistory(personId);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [all, setAll] = useState(false);
  const events = [...(q.data?.events ?? [])].reverse();
  if (!events.length) return null;
  const shown = all ? events : events.slice(0, FIRST);
  return (
    <Card>
      <View style={{ gap: 10 }} accessibilityLabel="History">
        <Text variant="label">History</Text>
        {shown.map((e) => (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}>
            <Text variant="body" style={{ flex: 1 }}>
              {describeRelationshipEvent(e, name)}
            </Text>
            <Text variant="caption" color="textTertiary">
              {formatDayHeading(e.at, now, timeZone, locale)}
            </Text>
          </View>
        ))}
        {events.length > FIRST ? (
          <Button
            label={all ? 'Show less' : `Show all ${events.length}`}
            variant="ghost"
            size="sm"
            onPress={() => setAll((v) => !v)}
          />
        ) : null}
      </View>
    </Card>
  );
}
