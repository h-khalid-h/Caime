import { tr } from '@caime/core/i18n';
import { joinPath } from '@caime/core/meetings';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

/**
 * A meeting's short address (M16 F6d, `cai.me/m/xxx-xxxx-xxx`), as a calendar opens it: the
 * card's conversation at the card, which joins its call when it's on (the conversation's own
 * `join`), and once the call is over and Cai's notes of it are written, those notes (M16 F6e). A
 * code that isn't this account's, or has gone with its card, says so, as a code nobody holds does.
 */
export default function MeetingLink() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const q = useQuery({
    queryKey: qk.meetingLink(code),
    queryFn: () => endpoints.meetingLink(code),
    enabled: code !== '',
    retry: false,
  });
  useEffect(() => {
    const d = q.data;
    if (!d) return;
    // Its call over and Cai's notes of it written (M16 F6e): the notes, at the call's line.
    if (d.notes)
      router.replace(`/c/${d.conversationId}?seq=${d.notes.seq}&notes=${d.notes.callId}`);
    else router.replace(joinPath(d.conversationId, d.seq, d.messageId));
  }, [q.data]);
  const gone = !code || (q.isError && q.error instanceof ApiError && q.error.status === 404);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <Card>
          {gone ? (
            <View style={{ gap: 12 }} testID="meeting-link-gone">
              <Text variant="headline" accessibilityRole="header">
                {tr('Nothing to open')}
              </Text>
              <Text variant="body" color="textSecondary">
                {tr(
                  'This meeting isn’t in a conversation of yours, or it was called off. Ask whoever sent it.',
                )}
              </Text>
              <Button
                label={tr('Go to Caime')}
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </View>
          ) : q.isError ? (
            <View style={{ gap: 12 }}>
              <Text variant="body" color="textSecondary">
                {(q.error as Error).message}
              </Text>
              <Button
                label={tr('Try again')}
                variant="secondary"
                onPress={() => void q.refetch()}
              />
            </View>
          ) : (
            <SkeletonRows count={2} />
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
