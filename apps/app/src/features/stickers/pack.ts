import type { Character, Expression } from '@caime/brand/characters';

/** Caishy Friends, the first sticker pack (BRAND.md B3): the characters say what words can't. */
export const STICKER_PACK = 'caishy-friends';

export interface StickerDef {
  id: string;
  character: Character;
  expression: Expression;
  /** What a screen reader says, and what the sticker means. */
  label: string;
}

export const STICKERS: StickerDef[] = [
  { id: 'caishy.happy', character: 'caishy', expression: 'happy', label: 'Caishy smiling' },
  { id: 'caishy.shy', character: 'caishy', expression: 'shy', label: 'Caishy, thank you' },
  { id: 'caishy.excited', character: 'caishy', expression: 'excited', label: 'Caishy, yay' },
  { id: 'caishy.sad', character: 'caishy', expression: 'sad', label: 'Caishy, sorry' },
  { id: 'momo.excited', character: 'momo', expression: 'excited', label: 'Momo celebrating' },
  { id: 'momo.wink', character: 'momo', expression: 'wink', label: 'Momo winking' },
  { id: 'panda.sleepy', character: 'panda', expression: 'sleepy', label: 'Panda, good night' },
  { id: 'panda.happy', character: 'panda', expression: 'happy', label: 'Panda, I’m here' },
  { id: 'lumi.curious', character: 'lumi', expression: 'curious', label: 'Lumi has an idea' },
  { id: 'lumi.surprised', character: 'lumi', expression: 'surprised', label: 'Lumi, wow' },
  { id: 'pico.curious', character: 'pico', expression: 'curious', label: 'Pico, question?' },
  { id: 'pico.sad', character: 'pico', expression: 'sad', label: 'Pico, oh no' },
  { id: 'niko.excited', character: 'niko', expression: 'excited', label: 'Niko, let’s go' },
  { id: 'niko.grumpy', character: 'niko', expression: 'grumpy', label: 'Niko, hmph' },
  { id: 'zuzu.wink', character: 'zuzu', expression: 'wink', label: 'Zuzu, trust me' },
  { id: 'zuzu.happy', character: 'zuzu', expression: 'happy', label: 'Zuzu, all good' },
];

export function stickerById(id: unknown): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}
