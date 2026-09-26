/**
 * Translations the person asked for, by message, for this session only: a translation is a
 * suggestion shown under the original, never a replacement for it (R17).
 */
import { create } from 'zustand';
import { endpoints } from '@/api/endpoints';

export type Translation =
  | { state: 'loading' }
  | { state: 'done'; text: string; language: string; label: string }
  | { state: 'failed'; error: string };

interface Translations {
  byId: Record<string, Translation>;
  put: (id: string, t: Translation) => void;
  hide: (id: string) => void;
}

export const useTranslations = create<Translations>((set) => ({
  byId: {},
  put: (id, t) => set((s) => ({ byId: { ...s.byId, [id]: t } })),
  hide: (id) =>
    set((s) => {
      const next = { ...s.byId };
      delete next[id];
      return { byId: next };
    }),
}));

export async function translate(messageId: string): Promise<void> {
  const { put } = useTranslations.getState();
  put(messageId, { state: 'loading' });
  try {
    const r = await endpoints.aiTranslate(messageId);
    put(messageId, { state: 'done', text: r.translation, language: r.language, label: r.label });
  } catch (e) {
    put(messageId, { state: 'failed', error: (e as Error).message });
  }
}
