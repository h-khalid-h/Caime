/**
 * How Caishy thinks someone may be known to you (PRD §12), from what both of you are part of: a
 * team, a space, a company email, how they described it. Always an offer, never a fact: nothing
 * changes until it's accepted (or changed first), and "Not now" means it won't come back.
 */
import type { ConnectionView, SuggestionView } from '@caishy/core/api';
import { relationshipOfferText } from '@caishy/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints, type RelationshipInput } from '@/api/endpoints';
import { useRelationshipOffers } from '@/api/hooks';
import { qk } from '@/api/keys';
import { RelationshipPicker } from '@/features/relationships/RelationshipPicker';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Sparkles } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

type Offer = { sphere?: string | null; role?: string | null; orgName?: string | null };

const offerOf = (s: SuggestionView) => (s.payload ?? {}) as Offer;

function OfferCard({
  s,
  person,
  onOpen,
}: {
  s: SuggestionView;
  person: { id: string; displayName: string };
  /** In People: their page, for more than yes or no. */
  onOpen?: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'dismiss' | null>(null);
  const [changing, setChanging] = useState(false);
  const first = person.displayName.split(' ')[0] ?? person.displayName;
  const refresh = () => {
    for (const key of [
      ['suggestions'],
      qk.person(person.id),
      qk.connections,
      qk.inbox,
      qk.relationshipHistory(person.id),
      ['conversation'],
      ['policy-for'],
    ])
      void qc.invalidateQueries({ queryKey: key });
  };
  const accept = async (relationship?: RelationshipInput) => {
    setBusy('accept');
    try {
      await endpoints.acceptSuggestion(s.id, relationship ? { relationship } : {});
      toast('Saved. Only you see it.');
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async () => {
    setBusy('dismiss');
    try {
      await endpoints.dismissSuggestion(s.id);
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const offer = offerOf(s);
  return (
    <Card>
      <View style={{ gap: 10 }} testID="relationship-offer">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Sparkles size={18} color={t.c.accentStrong} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong" onPress={onOpen}>
              {`Caishy thinks ${relationshipOfferText(first, offer)}.`}
            </Text>
            <Text variant="caption" color="textSecondary">
              {s.rationale}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            label="Accept"
            size="sm"
            loading={busy === 'accept'}
            onPress={() => void accept()}
            testID="relationship-offer-accept"
          />
          <Button
            label="Change"
            size="sm"
            variant="secondary"
            onPress={() => setChanging(true)}
            testID="relationship-offer-change"
          />
          <Button
            label="Not now"
            size="sm"
            variant="ghost"
            loading={busy === 'dismiss'}
            onPress={() => void dismiss()}
            testID="relationship-offer-dismiss"
          />
        </View>
        <Text variant="caption" color="textTertiary">
          Only you see how you know {first}, and nothing changes until you say so.
        </Text>
      </View>
      <RelationshipPicker
        open={changing}
        onClose={() => setChanging(false)}
        person={person}
        initial={{
          sphere: (offer.sphere ?? undefined) as never,
          role: offer.role ?? null,
          orgName: offer.orgName ?? null,
        }}
        onPick={(draft) => void accept(draft)}
      />
    </Card>
  );
}

/** On someone's page: what Caishy thinks they may be to you, while you haven't said. */
export function PersonOffer({ person }: { person: { id: string; displayName: string } }) {
  const q = useRelationshipOffers(person.id);
  const s = q.data?.suggestions[0];
  if (!s) return null;
  return <OfferCard s={s} person={person} />;
}

/** At the top of People: the people Caishy has an idea about, a few at a time. */
export function RelationshipOffers({ all }: { all: ConnectionView[] }) {
  const q = useRelationshipOffers();
  // On a desktop, the person open beside the list has theirs on their page: once is enough.
  const open = usePathname().match(/^\/p\/([^/]+)/)?.[1];
  const offers = (q.data?.suggestions ?? [])
    .filter((s) => s.subjectUserId !== open)
    .map((s) => ({ s, c: all.find((c) => c.person.id === s.subjectUserId) }))
    .filter((x): x is { s: SuggestionView; c: ConnectionView } => Boolean(x.c))
    .slice(0, 3);
  if (!offers.length) return null;
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      {offers.map(({ s, c }) => (
        <OfferCard
          key={s.id}
          s={s}
          person={c.person}
          onOpen={() => router.navigate({ pathname: '/p/[id]', params: { id: c.person.id } })}
        />
      ))}
    </View>
  );
}
