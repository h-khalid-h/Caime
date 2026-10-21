import type { CaiOfferPayload } from '@caime/core/api';
import { firstName } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { callsSupported, startCall } from '@/features/calls/calls';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/*
 * What Cai and the friends offer under their lines, done only on the reader's tap: R68's
 * follow-up and M16 G14's offers, one module loaded with the first one shown, so the drafted
 * message's one look (`DraftOffer`) is in no chunk but this.
 */

/** What Cai's follow-up offer carries (R68): where it goes, to whom, and the words. */
export interface FollowUpPayload {
  taskId: string;
  conversationId: string;
  to: string;
  draft: string;
  sentAt?: string;
}

/**
 * Under a message Cai drafted for the reader to send as theirs (R68's follow-up, M16 G14's
 * message or meeting): send it to whom it's for, or open the conversation with it in the composer
 * to change first. Nothing goes until one of them is pressed. One look for every such offer.
 */
function DraftOffer({
  to,
  sent: sentBefore,
  send,
  change,
  testID,
}: {
  /** Whom it's for, by their name as it's shown. */
  to: string;
  sent: boolean;
  send: () => Promise<unknown>;
  /** Opens it to change first; left out where it can't be (a meeting's card). */
  change?: () => void;
  testID: string;
}) {
  const [busy, setBusy] = useState(false);
  // Sent here, or anywhere else of theirs (the line comes back saying so).
  const [sentHere, setSent] = useState(false);
  const sent = sentBefore || sentHere;
  const name = firstName(to);
  if (sent)
    return (
      <Text
        variant="caption"
        color="textSecondary"
        style={{ marginStart: 12, marginTop: 4 }}
        testID={`${testID}-sent`}
      >
        {tr('Sent to {name}', { name })}
      </Text>
    );
  const press = async () => {
    setBusy(true);
    try {
      await send();
      setSent(true);
      toast(tr('Sent to {name}', { name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginStart: 12, marginTop: 6 }}
      testID={`${testID}-offer`}
    >
      <Button
        label={tr('Send to {name}', { name })}
        size="sm"
        loading={busy}
        onPress={() => void press()}
        testID={`${testID}-send`}
      />
      {change ? (
        <Button
          label={tr('Change it first')}
          size="sm"
          variant="secondary"
          onPress={change}
          testID={`${testID}-edit`}
        />
      ) : null}
    </View>
  );
}

/** Under Cai's offer of a follow-up (R68), drawn as every drafted message is. */
export function FollowUpOffer({ messageId, offer }: { messageId: string; offer: FollowUpPayload }) {
  const qc = useQueryClient();
  return (
    <DraftOffer
      to={offer.to}
      sent={Boolean(offer.sentAt)}
      send={async () => {
        await endpoints.sendFollowUp(messageId);
        void qc.invalidateQueries({ queryKey: qk.attentionHome });
        void qc.invalidateQueries({ queryKey: qk.cai });
      }}
      change={() =>
        router.navigate({
          pathname: '/c/[id]',
          params: { id: offer.conversationId, say: offer.draft },
        })
      }
      testID="follow-up"
    />
  );
}

/**
 * Under Cai's (or a friend's) line offering to do something for the reader (M16 G14, R110), done
 * only on their tap: a message, or a meeting card, sent as theirs the way a follow-up is (R68), a
 * call started here, a search opened. With nobody to chat with yet, their chat is opened as the
 * app opens any (its rules with it) before anything goes. Loaded with the first one shown.
 */
export default function CaiOffer({
  messageId,
  offer,
}: {
  messageId: string;
  offer: CaiOfferPayload;
}) {
  const row = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginStart: 12,
    marginTop: 6,
  } as const;
  const chat = async () =>
    offer.conversationId ?? (await endpoints.openDirect(offer.to!.id)).conversation.id;
  if (offer.kind === 'find')
    return (
      <View style={row} testID="offer-find">
        <Button
          label={tr('Search')}
          size="sm"
          variant="secondary"
          onPress={() => router.navigate({ pathname: '/search', params: { q: offer.query ?? '' } })}
          testID="offer-search"
        />
      </View>
    );
  if (!offer.to) return null;
  const name = firstName(offer.to.name);
  if (offer.kind === 'call') {
    const id = offer.conversationId;
    if (!id) return null;
    return (
      <View style={row} testID="offer-call">
        {callsSupported ? (
          <Button
            label={
              offer.video ? tr('Video call {name}', { name }) : tr('Voice call {name}', { name })
            }
            size="sm"
            onPress={() => void startCall(id, offer.video ? 'video' : 'voice')}
            testID="offer-call-start"
          />
        ) : (
          <Button
            label={tr('Open')}
            size="sm"
            variant="secondary"
            onPress={() => router.navigate({ pathname: '/c/[id]', params: { id } })}
            testID="offer-call-open"
          />
        )}
      </View>
    );
  }
  return (
    <DraftOffer
      to={offer.to.name}
      sent={Boolean(offer.doneId)}
      send={async () => endpoints.carryOutOffer(messageId, await chat())}
      change={
        offer.kind === 'message'
          ? () =>
              void chat()
                .then((id) =>
                  router.navigate({ pathname: '/c/[id]', params: { id, say: offer.text ?? '' } }),
                )
                .catch((e: Error) => toast(e.message, { tone: 'danger' }))
          : undefined
      }
      testID="offer"
    />
  );
}
