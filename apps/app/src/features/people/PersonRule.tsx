/**
 * How Caishy treats one person (PRD §68): what their relationship's rule says, and a rule just for
 * them on top of it, changed from their page. Theirs is made with its first change, so "just for
 * them" always means something, and nothing is made or taken away by opening and closing it.
 */
import type { RelationshipView } from '@caishy/core/api';
import { resolvePolicy } from '@caishy/core/policy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';

import { Card } from '@/ui/Card';
import { Bell } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';

// Shared with Notifications and Automations: loaded when their rule is opened.
const RuleSheet = lazyPart(() => import('@/features/settings/RuleSheet').then((m) => m.RuleSheet));

export function PersonRule({
  personId,
  name,
  connectionId,
  relationship,
}: {
  personId: string;
  name: string;
  connectionId: string;
  relationship: RelationshipView | undefined;
}) {
  const qc = useQueryClient();
  const policies = usePolicies();
  const said = useQuery({
    queryKey: ['policy-for', personId],
    queryFn: () => endpoints.policyFor(personId),
  });
  const [open, setOpen] = useState(false);
  const all = policies.data?.policies ?? [];
  const theirs = all.find((p) => p.scope.connectionId === connectionId) ?? null;
  // The server's, which knows the organization they're with; until it answers, from their role.
  const inherited =
    said.data?.inherited ??
    resolvePolicy(
      all.filter((p) => p.id !== theirs?.id),
      { sphere: relationship?.sphere ?? null, role: relationship?.role ?? null },
    );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.policies });
    void qc.invalidateQueries({ queryKey: ['policy-for', personId] });
    // Their page says what they see of you.
    void qc.invalidateQueries({ queryKey: qk.person(personId) });
  };
  const close = () => {
    setOpen(false);
    refresh();
  };
  return (
    <Card padded={false}>
      <ListRow
        icon={Bell}
        title="Notifications and priority"
        subtitle={
          [
            said.data?.description,
            theirs && Object.keys(theirs.settings).length ? 'Just for them' : null,
          ]
            .filter(Boolean)
            .join(' · ') || null
        }
        chevron
        onPress={() => setOpen(true)}
        testID="person-rule"
      />
      {open ? (
        <RuleSheet
          // Theirs once it's made is the same sheet: it's keyed by them, not by the rule.
          key={connectionId}
          rule={theirs}
          scope={{ connectionId }}
          inherited={inherited}
          title={name}
          subtitle="Just for them, over how you know them"
          open
          onClose={close}
          deleteLabel={`Treat ${name} like everyone you know this way`}
          onDeleted={refresh}
        />
      ) : null}
    </Card>
  );
}
