/**
 * Caime's own accounts (R67): Cai, the assistant anyone can chat with, and the seven Caime
 * Friends, the brand's characters, each talking about its own job (BRAND.md). They are users of
 * kinds of their own with fixed ids (seeded by migration 0059), opened as a direct conversation
 * like anyone's; they never write first, never ring and never count as people. What they say is
 * the server's (`lib/system-accounts.ts`, R71): each understands what's written to it by the rules
 * (`chat-intent.ts`) and, for whoever may use AI assist, answers the rest in its own character.
 * Pure, no zod: the app takes it by subpath.
 */
import { msg } from './i18n';
import { CAI_ID, type SystemKind } from './system-ids';

export { CAI_ID, isSystemKind, type SystemKind, systemHandleOf } from './system-ids';

export const CHARACTER_HANDLES = [
  'caishy',
  'momo',
  'panda',
  'lumi',
  'pico',
  'niko',
  'zuzu',
] as const;
export type CharacterHandle = (typeof CHARACTER_HANDLES)[number];

export interface SystemAccount {
  /** Fixed, so the server needs no lookup and the app knows one by its id. */
  id: string;
  handle: 'cai' | CharacterHandle;
  kind: SystemKind;
  name: string;
  /** What it's for, as a key: its profile's line. */
  about: string;
}

export const SYSTEM_ACCOUNTS: readonly SystemAccount[] = [
  {
    id: CAI_ID,
    handle: 'cai',
    kind: 'assistant',
    name: 'Cai',
    about: msg('Caime’s assistant. Knows what’s waiting, what you said you’d do and what’s next.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca11',
    handle: 'caishy',
    kind: 'character',
    name: 'Caishy',
    about: msg('The Dreamer. Welcome, and stickers.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca12',
    handle: 'momo',
    kind: 'character',
    name: 'Momo',
    about: msg('The Cheerful. Here when nothing needs you.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca13',
    handle: 'panda',
    kind: 'character',
    name: 'Panda',
    about: msg('The Loyal. Waiting and follow-ups.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca14',
    handle: 'lumi',
    kind: 'character',
    name: 'Lumi',
    about: msg('The Creative. Groups, topics and spaces.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca15',
    handle: 'pico',
    kind: 'character',
    name: 'Pico',
    about: msg('The Curious. Search and finding people.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca16',
    handle: 'niko',
    kind: 'character',
    name: 'Niko',
    about: msg('The Brave. First steps.'),
  },
  {
    id: '00000000-0000-4000-8000-00000000ca17',
    handle: 'zuzu',
    kind: 'character',
    name: 'Zuzu',
    about: msg('The Wise. What was decided, remembered.'),
  },
];

export function systemAccountOf(id: string | null | undefined): SystemAccount | undefined {
  return SYSTEM_ACCOUNTS.find((a) => a.id === id);
}

export function isCharacterHandle(handle: string): handle is CharacterHandle {
  return (CHARACTER_HANDLES as readonly string[]).includes(handle);
}
