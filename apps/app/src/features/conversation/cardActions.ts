/**
 * A card asking the composer for another card's form (R62): "Pay" on an order or an appointment
 * opens the Pay card's form, filled from it and replying to it. In the conversation's chunk; the
 * composer takes the request and clears it.
 */
import { create } from 'zustand';
import type { KitChoice, KitStart } from '@/features/kits/KitForm';

export const useCardAction = create<{
  request: { conversationId: string; kit: KitChoice; start: KitStart } | null;
}>(() => ({ request: null }));
