import {
  AGENT_ACTION_LABELS,
  AGENT_KNOWLEDGE_MAX,
  AGENT_NAME_MAX,
  defaultAgentName,
} from '@caime/core/agents';
import type { AgentTryView, OrgView } from '@caime/core/api';
import { msg, tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Trash from 'lucide-react-native/icons/trash';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const WHAT_IT_DOES = msg(
  'It says it’s an AI in every message, answers only from what you tell it, and hands anything else to your team: bookings, payments, complaints, or anyone who asks for a person. It never answers anyone under 18, and never takes a conversation from a person.',
);

/**
 * An organization's AI agent (PRD §74–75), for its owner and admins: what it knows, a question
 * to try it on before anyone hears from it, answering or paused, and removed.
 */
export function OrgAgent({ org }: { org: OrgView }) {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.orgAgent(org.id), queryFn: () => endpoints.orgAgent(org.id) });
  const agent = q.data?.agent ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [question, setQuestion] = useState('');
  const [tried, setTried] = useState<AgentTryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The server says what's wrong with a field (knowledge too short, say), under that field.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; knowledge?: string }>({});
  const [busy, setBusy] = useState<'save' | 'try' | 'pause' | 'remove' | null>(null);
  const [removing, setRemoving] = useState(false);

  // Where AI isn't set up on the server, there's nothing to offer.
  if (!q.data?.available) return null;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.orgAgent(org.id) });
    void qc.invalidateQueries({ queryKey: qk.org(org.handle) });
  };
  const edit = () => {
    setName(agent?.name ?? defaultAgentName(org.name));
    setKnowledge(agent?.knowledge ?? '');
    setQuestion('');
    setTried(null);
    setError(null);
    setFieldErrors({});
    setRemoving(false);
    setOpen(true);
  };
  const work = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
    } catch (e) {
      const fields = e instanceof ApiError ? e.fieldErrors() : {};
      if (fields.name || fields.knowledge)
        setFieldErrors({ name: fields.name, knowledge: fields.knowledge });
      else setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    work('save', async () => {
      await endpoints.setOrgAgent(org.id, {
        name: name.trim(),
        knowledge: knowledge.trim(),
        paused: agent?.paused ?? false,
      });
      refresh();
      setOpen(false);
      toast(
        agent
          ? tr('{trim} is up to date', { trim: name.trim() })
          : tr('{trim} answers your customers first now', { trim: name.trim() }),
      );
    });
  const tryIt = () =>
    work('try', async () => {
      setTried(
        await endpoints.tryOrgAgent(org.id, {
          name: name.trim(),
          knowledge: knowledge.trim(),
          question: question.trim(),
        }),
      );
    });
  const pause = async (paused: boolean) => {
    if (!agent) return;
    setBusy('pause');
    try {
      await endpoints.setOrgAgent(org.id, { name: agent.name, knowledge: agent.knowledge, paused });
      refresh();
      toast(
        paused
          ? tr('{name} is paused: your team answers everyone', { name: agent.name })
          : tr('{name} answers first again', { name: agent.name }),
      );
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const remove = () =>
    work('remove', async () => {
      await endpoints.removeOrgAgent(org.id);
      refresh();
      setOpen(false);
      toast(tr('The AI agent left the team. What it wrote stays.'));
    });

  const status = agent
    ? agent.paused
      ? tr('Paused: your team answers everyone')
      : tr('Answers first · {repliesToday} of {toLocaleString} answers in the last 24 hours', {
          repliesToday: agent.repliesToday,
          toLocaleString: agent.repliesPerDay.toLocaleString('en-US'),
        })
    : null;

  return (
    <>
      <SectionTitle>{tr('AI agent')}</SectionTitle>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        {agent ? (
          <>
            <ListRow
              icon={Sparkles}
              title={agent.name}
              subtitle={status ?? undefined}
              chevron
              onPress={edit}
              testID="org-agent"
            />
            <ListRow
              title={agent.paused ? tr('Let it answer again') : tr('Pause it')}
              subtitle={
                agent.paused
                  ? undefined
                  : tr('It stays on the team, quiet, until you let it answer')
              }
              onPress={() => void pause(!agent.paused)}
              testID="org-agent-pause"
            />
          </>
        ) : (
          <>
            <Text variant="caption" color="textSecondary" style={{ padding: 14, paddingBottom: 4 }}>
              {tr(
                'Let an AI agent answer the simple questions first, from what you tell it: hours, prices, how to book. {what}',
                { what: tr(WHAT_IT_DOES) },
              )}
            </Text>
            <ListRow
              icon={Sparkles}
              title={tr('Set up an AI agent')}
              onPress={edit}
              testID="org-agent-setup"
            />
          </>
        )}
      </View>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={agent ? agent.name : tr('Set up an AI agent')}
        subtitle={
          agent
            ? tr('What it knows, and how it answers')
            : tr('It answers first, and says it’s an AI')
        }
        footer={
          removing ? (
            <Button
              label={tr('Remove it: it leaves the team now')}
              variant="danger"
              block
              size="lg"
              loading={busy === 'remove'}
              onPress={() => void remove()}
              testID="org-agent-remove-confirm"
            />
          ) : (
            <Button
              label={agent ? tr('Save') : tr('Turn it on')}
              block
              size="lg"
              loading={busy === 'save'}
              disabled={!name.trim() || !knowledge.trim()}
              onPress={() => void save()}
              testID="org-agent-save"
            />
          )
        }
      >
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Its name')}
            value={name}
            onChangeText={setName}
            maxLength={AGENT_NAME_MAX}
            hint={tr('Customers see it on everything it writes, with “AI agent”.')}
            error={fieldErrors.name}
            testID="org-agent-name"
          />
          <TextField
            label={tr('What it knows')}
            value={knowledge}
            onChangeText={setKnowledge}
            multiline
            maxLength={AGENT_KNOWLEDGE_MAX}
            placeholder={tr(
              'Open Sunday to Thursday 9 to 6, Saturday 9 to 1. A check-up is 400 EGP. Book by calling 02 2345 6789.',
            )}
            hint={tr(
              'Hours, services, prices, how to book, what you don’t do: a few sentences at least. It answers only from this.',
            )}
            error={fieldErrors.knowledge}
            testID="org-agent-knowledge"
          />
          <Text variant="caption" color="textTertiary">
            {tr(WHAT_IT_DOES)}
          </Text>
          <View style={{ gap: 8 }}>
            <Text variant="captionStrong" color="textSecondary">
              {tr('Try it first')}
            </Text>
            <TextField
              value={question}
              onChangeText={setQuestion}
              placeholder={tr('Ask what a customer would')}
              maxLength={1000}
              onSubmitEditing={() => question.trim() && void tryIt()}
              testID="org-agent-question"
            />
            <Button
              label={tr('Ask it')}
              variant="secondary"
              size="sm"
              loading={busy === 'try'}
              disabled={!question.trim() || !name.trim() || !knowledge.trim()}
              onPress={() => void tryIt()}
              style={{ alignSelf: 'flex-start' }}
              testID="org-agent-try"
            />
            {tried ? (
              <View
                style={{ gap: 4, padding: 12, borderRadius: 12, backgroundColor: t.c.surfaceMuted }}
                testID="org-agent-tried"
              >
                <Text variant="captionStrong" color="textSecondary">
                  {tr('{AGENT_ACTION_LABELS} · nothing was sent', {
                    AGENT_ACTION_LABELS: tr(AGENT_ACTION_LABELS[tried.action]),
                  })}
                </Text>
                <Text variant="body">{tried.message}</Text>
              </View>
            ) : null}
          </View>
          {error ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          {agent ? (
            <View style={{ marginHorizontal: -20 }}>
              <ListRow
                icon={Trash}
                title={tr('Remove the AI agent')}
                subtitle={tr('It leaves the team; what it wrote stays')}
                destructive
                onPress={() => setRemoving(true)}
                testID="org-agent-remove"
              />
            </View>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
