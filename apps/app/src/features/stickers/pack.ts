import type { Character, Expression } from '@caime/brand/characters';
import { msg } from '@caime/core/i18n';

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
  { id: 'caishy.happy', character: 'caishy', expression: 'happy', label: msg('Caishy smiling') },
  { id: 'caishy.shy', character: 'caishy', expression: 'shy', label: msg('Caishy, thank you') },
  { id: 'caishy.excited', character: 'caishy', expression: 'excited', label: msg('Caishy, yay') },
  { id: 'caishy.sad', character: 'caishy', expression: 'sad', label: msg('Caishy, sorry') },
  { id: 'momo.excited', character: 'momo', expression: 'excited', label: msg('Momo celebrating') },
  { id: 'momo.wink', character: 'momo', expression: 'wink', label: msg('Momo winking') },
  { id: 'panda.sleepy', character: 'panda', expression: 'sleepy', label: msg('Panda, good night') },
  { id: 'panda.happy', character: 'panda', expression: 'happy', label: msg('Panda, I’m here') },
  { id: 'lumi.curious', character: 'lumi', expression: 'curious', label: msg('Lumi has an idea') },
  { id: 'lumi.surprised', character: 'lumi', expression: 'surprised', label: msg('Lumi, wow') },
  { id: 'pico.curious', character: 'pico', expression: 'curious', label: msg('Pico, question?') },
  { id: 'pico.sad', character: 'pico', expression: 'sad', label: msg('Pico, oh no') },
  { id: 'niko.excited', character: 'niko', expression: 'excited', label: msg('Niko, let’s go') },
  { id: 'niko.grumpy', character: 'niko', expression: 'grumpy', label: msg('Niko, hmph') },
  { id: 'zuzu.wink', character: 'zuzu', expression: 'wink', label: msg('Zuzu, trust me') },
  { id: 'zuzu.happy', character: 'zuzu', expression: 'happy', label: msg('Zuzu, all good') },
];

export function stickerById(id: unknown): StickerDef | undefined {
  return STICKERS.find((s) => s.id === id);
}
