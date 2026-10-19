/**
 * What an organization says by itself (M16 H2), for its owner and admins: a greeting the first
 * time a customer writes, an away message while its hours say it's closed (Caime adds when it
 * opens again), and the quick replies its team puts in a reply with "/" and a shortcut.
 */
import type { OrgView, QuickReplyView } from '@caime/core/api';
import { foldForFind } from '@caime/core/fold';
import { tr, trn } from '@caime/core/i18n';
import {
  AUTO_REPLY_CHARS,
  QUICK_REPLIES_MAX,
  QUICK_REPLY_CHARS,
  SHORTCUT_PATTERN,
} from '@caime/core/quick-replies';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Hand from 'lucide-react-native/icons/hand';
import Moon from 'lucide-react-native/icons/moon';
import Trash from 'lucide-react-native/icons/trash';
import Zap from 'lucide-react-native/icons/zap';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { putAnswer } from '@/state/cache';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

type Said = 'greeting' | 'away';
type Draft = { id?: string; shortcut: string; body: string };

/** The words of a shortcut as kept: without the "/" someone typed before it. */
const bare = (shortcut: string) => shortcut.trim().replace(/^\/+/, '');

export function OrgReplies({ org, refresh }: { org: OrgView; refresh: (o: OrgView) => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const replies = org.replies;
  // Its AI agent greets customers itself while it answers (the same query as its section's).
  const agentQ = useQuery({
    queryKey: qk.orgAgent(org.id),
    queryFn: () => endpoints.orgAgent(org.id),
  });
  const agentAnswers = Boolean(
    agentQ.data?.available && agentQ.data.agent && !agentQ.data.agent.paused,
  );
  const quickQ = useQuery({
    queryKey: qk.quickReplies(org.id),
    queryFn: () => endpoints.quickReplies(org.id),
  });
  const quick = quickQ.data?.replies ?? [];

  const [editing, setEditing] = useState<Said | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listing, setListing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // The reply being written: its place in the drafts, or null for a new one.
  const [at, setAt] = useState<number | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  if (!replies) return null;

  const open = (what: Said) => {
    setText((what === 'greeting' ? replies.greeting : replies.away) ?? '');
    setError(null);
    setEditing(what);
  };
  const save = async (what: Said, value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.updateOrg(
        org.id,
        what === 'greeting' ? { greeting: value } : { away: value },
      );
      refresh(res.org);
      setEditing(null);
      toast(
        value
          ? what === 'greeting'
            ? tr('Customers are greeted when they first write')
            : tr('Customers hear your away message while you’re closed')
          : what === 'greeting'
            ? tr('The greeting is off')
            : tr('The away message is off'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openList = () => {
    setDrafts(quick.map((r: QuickReplyView) => ({ id: r.id, shortcut: r.shortcut, body: r.body })));
    setAt(null);
    setShortcut('');
    setBody('');
    setShortcutError(null);
    setError(null);
    setListing(true);
  };
  const pick = (i: number) => {
    const d = drafts[i];
    if (!d) return;
    setAt(i);
    setShortcut(d.shortcut);
    setBody(d.body);
    setShortcutError(null);
  };
  /** The drafts with what's typed in the fields kept too, or null (and why) when it can't be. */
  const withTyped = (): Draft[] | null => {
    const word = bare(shortcut);
    if (!word && !body.trim()) return drafts;
    if (!SHORTCUT_PATTERN.test(word)) {
      setShortcutError(tr('A shortcut is one word: letters, digits, - or _.'));
      return null;
    }
    if (drafts.some((d, i) => i !== at && foldForFind(d.shortcut) === foldForFind(word))) {
      setShortcutError(tr('Each quick reply needs a shortcut of its own.'));
      return null;
    }
    if (!body.trim()) return drafts;
    const next = {
      id: at === null ? undefined : drafts[at]?.id,
      shortcut: word,
      body: body.trim(),
    };
    return at === null ? [...drafts, next] : drafts.map((d, i) => (i === at ? next : d));
  };
  const keep = () => {
    const next = withTyped();
    if (!next) return;
    setDrafts(next);
    setAt(null);
    setShortcut('');
    setBody('');
    setShortcutError(null);
  };
  const drop = (i: number) => {
    setDrafts(drafts.filter((_, j) => j !== i));
    if (at === i) {
      setAt(null);
      setShortcut('');
      setBody('');
    } else if (at !== null && at > i) setAt(at - 1);
  };
  const saveList = async () => {
    // What's typed and not yet added goes with the rest, as anyone pressing Save means.
    const list = withTyped();
    if (!list) return;
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.saveQuickReplies(org.id, list);
      putAnswer(qc, qk.quickReplies(org.id), res);
      setListing(false);
      toast(
        res.replies.length
          ? trn(
              res.replies.length,
              'One quick reply: your team types / to use it',
              '{n} quick replies: your team types / to use them',
            )
          : tr('No quick replies now'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const said = (value: string | null) => (value ? value.replace(/\s+/g, ' ') : tr('Off'));

  return (
    <>
      <SectionTitle>{tr('Replies')}</SectionTitle>
      {agentAnswers ? (
        <Text
          variant="caption"
          color="textSecondary"
          style={{ paddingHorizontal: 16, paddingBottom: 8 }}
          testID="org-replies-agent"
        >
          {tr(
            'Your AI agent answers first and introduces itself, so the greeting and the away message wait while it does.',
          )}
        </Text>
      ) : null}
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        <ListRow
          icon={Hand}
          title={tr('Greeting')}
          subtitle={said(replies.greeting)}
          chevron
          onPress={() => open('greeting')}
          testID="org-greeting"
        />
        <ListRow
          icon={Moon}
          title={tr('Away message')}
          subtitle={
            org.booking
              ? said(replies.away)
              : tr('Set your bookable hours first: it’s sent while they say you’re closed')
          }
          chevron
          onPress={() => open('away')}
          testID="org-away"
        />
        <ListRow
          icon={Zap}
          title={tr('Quick replies')}
          subtitle={
            quick.length
              ? trn(
                  quick.length,
                  'One kept: type / in a customer’s conversation',
                  '{n} kept: type / in a customer’s conversation',
                )
              : tr('Answers your team puts in with / and a shortcut')
          }
          chevron
          onPress={openList}
          testID="org-quick-replies"
        />
      </View>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'away' ? tr('Away message') : tr('Greeting')}
        subtitle={
          editing === 'away'
            ? tr(
                'Sent once while your hours say you’re closed, unless someone on the team is answering there',
              )
            : tr(
                'Sent the first time someone writes, and when they write again after two quiet weeks',
              )
        }
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              loading={busy}
              disabled={!text.trim()}
              onPress={() => editing && void save(editing, text.trim())}
              testID="org-reply-save"
            />
            {editing && (editing === 'greeting' ? replies.greeting : replies.away) ? (
              <Button
                label={tr('Turn it off')}
                variant="ghost"
                block
                disabled={busy}
                onPress={() => void save(editing, null)}
                testID="org-reply-off"
              />
            ) : null}
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('What it says')}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={AUTO_REPLY_CHARS}
            placeholder={
              editing === 'away'
                ? tr('Thanks for writing. We’re closed now and answer as soon as we’re back.')
                : tr('Welcome! Tell us what you need, and someone from the team answers here.')
            }
            error={error}
            testID="org-reply-text"
          />
          <Text variant="caption" color="textTertiary">
            {editing === 'away'
              ? org.booking
                ? tr(
                    'Caime adds when you open again, on each customer’s clock and in their language.',
                  )
                : tr(
                    'It waits for your bookable hours: set them under Bookings, and it goes out while they say you’re closed.',
                  )
              : tr(
                  'It comes from {name}, marked as automated, and never counts as an answer: the conversation still waits for your team.',
                  { name: org.name },
                )}
          </Text>
        </View>
      </Sheet>

      <Sheet
        open={listing}
        onClose={() => setListing(false)}
        title={tr('Quick replies')}
        subtitle={tr('Your team types / and a shortcut in a customer’s conversation to put one in')}
        footer={
          <Button
            label={tr('Save')}
            block
            size="lg"
            loading={busy}
            onPress={() => void saveList()}
            testID="quick-replies-save"
          />
        }
      >
        <View style={{ gap: 12 }}>
          {drafts.length ? (
            <View
              style={{
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: t.c.border,
                overflow: 'hidden',
              }}
            >
              {drafts.map((d, i) => (
                <ListRow
                  key={d.id ?? `new-${i}`}
                  title={`/${d.shortcut}`}
                  subtitle={d.body.replace(/\s+/g, ' ')}
                  selected={at === i}
                  onPress={() => pick(i)}
                  right={
                    <IconButton
                      icon={Trash}
                      label={tr('Remove /{shortcut}', { shortcut: d.shortcut })}
                      onPress={() => drop(i)}
                      testID={`quick-reply-remove-${i}`}
                    />
                  }
                  testID={`quick-reply-${i}`}
                />
              ))}
            </View>
          ) : (
            <Text variant="caption" color="textSecondary">
              {tr('None yet. Add what customers ask most: your hours, prices, how to find you.')}
            </Text>
          )}
          <TextField
            label={tr('Shortcut')}
            value={shortcut}
            onChangeText={(v) => {
              setShortcut(v);
              setShortcutError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={tr('hours')}
            error={shortcutError}
            testID="quick-reply-shortcut"
          />
          <TextField
            label={tr('The reply')}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={QUICK_REPLY_CHARS}
            placeholder={tr('We’re open Sunday to Thursday, 9 to 6.')}
            testID="quick-reply-body"
          />
          <Button
            label={at === null ? tr('Add it') : tr('Done')}
            variant="secondary"
            disabled={
              !bare(shortcut) || !body.trim() || (at === null && drafts.length >= QUICK_REPLIES_MAX)
            }
            onPress={keep}
            testID="quick-reply-keep"
          />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
