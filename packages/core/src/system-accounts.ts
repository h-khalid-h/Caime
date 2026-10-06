/**
 * Caime's own accounts (R67): Cai, the assistant anyone can chat with, and the seven Caime
 * Friends, the brand's characters, each talking about its own job (BRAND.md). They are users of
 * kinds of their own with fixed ids (seeded by migration 0059), opened as a direct conversation
 * like anyone's; they never write first, never ring and never count as people. What they say is
 * the server's (`lib/system-accounts.ts`): the characters from scripts, never a model. Pure, no
 * zod: the app takes it by subpath.
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

/** What Cai can answer by the rules alone, at no cost and in an instant. */
export type CaiIntent = 'waiting' | 'asked' | 'mine' | 'coming' | 'help';

/**
 * Each a question about one's own open things, said as people say it; anything wider (what to do
 * in Paris today) is the model's, so a list never answers a sentence it wasn't asked.
 */
const INTENTS: Array<[CaiIntent, RegExp]> = [
  [
    'asked',
    /\b(who(['’]?s| is) waiting (for|on) me|what(['’]?s| is| was| have i been) asked of me|what do i owe|what do (people|others) (want|need) from me)\b|من ينتظرني|ماذا (طُ?لب|يطلبون) مني|ما المطلوب مني|qui m['’]attend|qu['’]est-ce qu['’]on (m['’]a demandé|attend de moi)|beni kim bekliyor|benden ne (isteniyor|istendi|bekleniyor)/i,
  ],
  [
    'waiting',
    /\b(what am i waiting (for|on)|who am i waiting (for|on)|who owes me|what(['’]?s| is) (still )?pending)\b|ماذا أنتظر|ما الذي أنتظره|من أنتظر|qu['’]est-ce que j['’]attends|j['’]attends quoi|qui me doit|ne bekliyorum|kimi bekliyorum/i,
  ],
  [
    'mine',
    /\b(my (tasks|actions|to-?dos?|to-?do list)|what (did|have) i promised?|what did i say i(['’]?d| would)|what do i (have|need) to do)\b|ما هي مهامي|مهامي|بماذا وعدت|ماذا علي أن أفعل|mes tâches|qu['’]ai-je promis|j['’]ai promis quoi|qu['’]est-ce que je dois faire|görevlerim|ne söz verdim|ne yapmam gerekiyor/i,
  ],
  [
    'coming',
    /\b(what(['’]?s| is) (coming up|next|on my (calendar|schedule))|my (calendar|schedule|week|agenda)|what do i have (today|tomorrow|this week))\b|ماذا لدي (اليوم|غدًا|غدا|هذا الأسبوع)|ما القادم|جدولي|qu['’]est-ce que j['’]ai (aujourd['’]hui|demain|cette semaine)|mon agenda|qu['’]est-ce qui arrive|bugün ne var|yarın ne var|bu hafta ne var|takvimim/i,
  ],
  [
    'help',
    /^\s*(help|hi|hello|hey|what can you do\??|مرحبا|مساعدة|ماذا تستطيع|bonjour|salut|aide|merhaba|yardım)\s*[!.?؟]*\s*$/i,
  ],
];

/** The rule-answered question a message to Cai asks, if it's one; null sends it to the model. */
export function caiIntent(text: string): CaiIntent | null {
  const t = text.trim();
  if (!t) return null;
  for (const [intent, re] of INTENTS) if (re.test(t)) return intent;
  return null;
}
