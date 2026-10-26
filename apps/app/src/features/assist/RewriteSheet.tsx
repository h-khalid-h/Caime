import { AI_LABEL, REWRITE_LABELS, REWRITE_STYLES, type RewriteStyle } from '@caime/core/assist';
import { tr } from '@caime/core/i18n';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

/**
 * Rewrite a draft (PRD §45): pick a style, read what Caime suggests, and use it or keep yours.
 * The draft changes only on "Use this" (R17). With nothing written yet, it drafts a reply to what
 * the others said (M17 I11b), asked for as it opens: the person's to change and send (R110).
 */
export function RewriteSheet({
  open,
  text,
  conversationId,
  onUse,
  onClose,
}: {
  open: boolean;
  text: string;
  conversationId: string;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [style, setStyle] = useState<RewriteStyle | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const drafting = !text.trim();

  const close = () => {
    latest.current++;
    setStyle(null);
    setSuggestion(null);
    setError(null);
    setBusy(false);
    onClose();
  };

  const run = async (s: RewriteStyle | null) => {
    const ask = ++latest.current;
    setStyle(s);
    setBusy(true);
    setError(null);
    setSuggestion(null);
    try {
      const r = s
        ? await endpoints.aiRewrite({ text, style: s, conversationId })
        : await endpoints.draftReply(conversationId);
      if (ask === latest.current)
        if (r.suggestion) setSuggestion(r.suggestion);
        else setError(tr('Nothing to answer yet.'));
    } catch (e) {
      if (ask === latest.current) setError((e as Error).message);
    } finally {
      if (ask === latest.current) setBusy(false);
    }
  };

  // A reply is drafted once as the sheet opens: the tap that opened it asked for one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
  useEffect(() => {
    if (open && drafting) void run(null);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={drafting ? tr('Draft a reply') : tr('Rewrite')}
      subtitle={tr('Nothing changes until you choose.')}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={tr('Use this')}
            size="lg"
            style={{ flex: 1 }}
            disabled={!suggestion}
            onPress={() => {
              if (!suggestion) return;
              onUse(suggestion);
              close();
            }}
            testID="rewrite-use"
          />
          {drafting ? (
            <Button
              label={tr('Write another')}
              size="lg"
              variant="ghost"
              disabled={busy}
              onPress={() => void run(null)}
              testID="draft-again"
            />
          ) : (
            <Button label={tr('Keep mine')} size="lg" variant="ghost" onPress={close} />
          )}
        </View>
      }
    >
      {drafting ? null : (
        <ChoiceChips
          wrap
          flush
          label={tr('How to rewrite it')}
          value={style}
          onChange={(s) => void run(s)}
          options={REWRITE_STYLES.map((s) => ({ value: s, label: tr(REWRITE_LABELS[s]) }))}
          testID="rewrite"
        />
      )}
      {style || drafting ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: t.radii.lg,
            gap: 8,
            backgroundColor: t.c.surfaceMuted,
            minHeight: 88,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color={t.c.accentStrong} />
            <Text variant="overline" color="accentStrong">
              {tr(AI_LABEL)}
            </Text>
          </View>
          {busy ? (
            <Text variant="body" color="textSecondary">
              {tr('Writing…')}
            </Text>
          ) : error ? (
            <Text variant="body" color="danger">
              {error}
            </Text>
          ) : suggestion ? (
            <Text variant="body" auto={suggestion} testID="rewrite-suggestion" selectable>
              {suggestion}
            </Text>
          ) : null}
        </View>
      ) : null}
      {drafting ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
          {tr(
            'Caime sends this conversation’s recent messages to its AI provider to write this. Nothing is sent until you send it.',
          )}
        </Text>
      ) : style ? null : (
        <Text variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
          {tr(
            'Caime sends your draft to its AI provider to write this. It isn’t sent to anyone else.',
          )}
        </Text>
      )}
    </Sheet>
  );
}
