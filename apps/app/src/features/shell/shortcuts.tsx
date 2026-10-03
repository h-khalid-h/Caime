/**
 * Keyboard shortcuts on the web: search, moving between conversations in the inbox's order, and
 * a sheet that lists them (press ? or open it from You). Native apps keep the platform's own
 * keyboard behaviour. Keys browsers reserve (Ctrl+N, Ctrl+T, Ctrl+W) are left alone.
 */
import type { InboxAllResponse } from '@caime/core/api';
import { inboxAllList, inboxSections } from '@caime/core/attention';
import { msg, tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { create } from 'zustand';
import { qk } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import { useTheme } from '@/theme/theme';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

const mac =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform);
const MOD = mac ? '⌘' : 'Ctrl';

export const SHORTCUTS: Array<{ keys: string[]; does: string }> = [
  { keys: [MOD, 'K'], does: msg('Search') },
  { keys: ['Alt', '↑'], does: msg('Previous conversation') },
  { keys: ['Alt', '↓'], does: msg('Next conversation') },
  { keys: ['↑'], does: msg('Edit your last message, from an empty message box') },
  { keys: ['Enter'], does: msg('Send') },
  { keys: ['Shift', 'Enter'], does: msg('New line') },
  { keys: ['Esc'], does: msg('Cancel a reply or an edit') },
  { keys: ['?'], does: msg('Show these shortcuts') },
];

export const useShortcutsSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Conversation ids in the order the inbox shows them (attention sections, else recent). */
function inboxOrder(): string[] {
  const all = queryClient.getQueryData<InboxAllResponse>(qk.inboxAll)?.conversations ?? [];
  const { sections } = inboxSections(all);
  if (sections.length) return sections.flatMap((s) => s.items.map((i) => i.id));
  return inboxAllList(all).map((c) => c.id);
}

function step(delta: 1 | -1): void {
  const ids = inboxOrder();
  if (!ids.length) return;
  const current = window.location.pathname.match(/^\/c\/([^/?#]+)/)?.[1];
  const at = current ? ids.indexOf(current) : -1;
  const next = at < 0 ? (delta > 0 ? ids[0] : ids[ids.length - 1]) : ids[at + delta];
  if (next && next !== current) router.navigate({ pathname: '/c/[id]', params: { id: next } });
}

export function KeyboardShortcuts() {
  const t = useTheme();
  const open = useShortcutsSheet((s) => s.open);
  const setOpen = useShortcutsSheet((s) => s.setOpen);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.navigate('/search');
      } else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        step(e.key === 'ArrowUp' ? -1 : 1);
      } else if (e.key === '?' && !mod && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        useShortcutsSheet.getState().setOpen(true);
      }
    };
    // Capture phase: react-native-web's TextInput stops keydown from bubbling out of fields.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (Platform.OS !== 'web') return null;
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={tr('Keyboard shortcuts')}>
      <View style={{ gap: 12 }} accessibilityRole="list">
        {SHORTCUTS.map((s) => (
          <View
            key={tr(s.does)}
            accessibilityRole="text"
            accessibilityLabel={`${s.keys.join(' ')}: ${tr(s.does)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View style={{ flexDirection: 'row', gap: 4, minWidth: 104 }}>
              {s.keys.map((k) => (
                <View
                  key={k}
                  style={{
                    minWidth: 28,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderBottomWidth: 2,
                    borderColor: t.c.borderStrong,
                    backgroundColor: t.c.surfaceMuted,
                    alignItems: 'center',
                  }}
                >
                  <Text variant="captionStrong">{k}</Text>
                </View>
              ))}
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {tr(s.does)}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
