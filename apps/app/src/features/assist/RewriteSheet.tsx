import { AI_LABEL, REWRITE_LABELS, REWRITE_STYLES, type RewriteStyle } from '@caishy/core/assist';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Sparkles } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

/**
 * Rewrite a draft (PRD §45): pick a style, read what Caishy suggests, and use it or keep yours.
 * The draft changes only on "Use this" (R17).
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

  const close = () => {
    latest.current++;
    setStyle(null);
    setSuggestion(null);
    setError(null);
    setBusy(false);
    onClose();
  };

  const run = async (s: RewriteStyle) => {
    const ask = ++latest.current;
    setStyle(s);
    setBusy(true);
    setError(null);
    setSuggestion(null);
    try {
      const r = await endpoints.aiRewrite({ text, style: s, conversationId });
      if (ask === latest.current) setSuggestion(r.suggestion);
    } catch (e) {
      if (ask === latest.current) setError((e as Error).message);
    } finally {
      if (ask === latest.current) setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Rewrite"
      subtitle="Nothing changes until you choose."
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label="Use this"
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
          <Button label="Keep mine" size="lg" variant="ghost" onPress={close} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {REWRITE_STYLES.map((s) => (
          <Chip
            key={s}
            label={REWRITE_LABELS[s]}
            selected={style === s}
            onPress={() => void run(s)}
            testID={`rewrite-${s}`}
          />
        ))}
      </View>
      {style ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 16,
            gap: 8,
            backgroundColor: t.c.surfaceMuted,
            minHeight: 88,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color={t.c.accentStrong} />
            <Text variant="overline" color="accentStrong">
              {AI_LABEL}
            </Text>
          </View>
          {busy ? (
            <Text variant="body" color="textSecondary">
              Writing…
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
      ) : (
        <Text variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
          Caishy sends your draft to its AI provider to write this. It isn’t sent to anyone else.
        </Text>
      )}
    </Sheet>
  );
}
