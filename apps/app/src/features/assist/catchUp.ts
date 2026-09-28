/**
 * "Catch me up" results by conversation, for this session only: asked for with a tap, shown
 * with Caime's label, never stored or sent anywhere (R17).
 */
import { create } from 'zustand';
import { endpoints } from '@/api/endpoints';

export type CatchUp =
  | { state: 'loading' }
  | { state: 'done'; summary: string | null; label: string | null; newCount: number }
  | { state: 'failed'; error: string };

export const useCatchUps = create<{
  byId: Record<string, CatchUp>;
  put: (id: string, c: CatchUp) => void;
}>((set) => ({
  byId: {},
  put: (id, c) => set((s) => ({ byId: { ...s.byId, [id]: c } })),
}));

export async function catchUp(conversationId: string): Promise<void> {
  const { put } = useCatchUps.getState();
  put(conversationId, { state: 'loading' });
  try {
    const r = await endpoints.catchUp(conversationId);
    put(conversationId, {
      state: 'done',
      summary: r.summary,
      label: r.label,
      newCount: r.newCount,
    });
  } catch (e) {
    put(conversationId, { state: 'failed', error: (e as Error).message });
  }
}
