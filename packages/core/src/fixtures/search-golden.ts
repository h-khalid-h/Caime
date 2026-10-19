import type { FileKind, SearchScope } from '../search';
import type { Sphere } from '../taxonomy';

/**
 * What people type into Search, labelled by hand with how the rules should read it (M16 G10,
 * review 2026-10-17 §5 M: "search unmeasured"): where to look, who, what kind of file, who asked
 * whom, which days, and the words left to match (`words`: all of them, and nothing else but an
 * article). `now` is Mon 2026-10-05 14:00 UTC, so "last week" is 2026-09-28 up to 2026-10-05.
 * Written before the rules were measured on them; `search-golden.test.ts` holds each language to
 * a floor set at what was measured, only ever raised, and prints every query it read wrong.
 */
export interface SearchLine {
  query: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  expect: {
    scope: SearchScope;
    person?: string | null;
    fileKind?: FileKind | null;
    direction?: 'asked_me' | 'i_asked' | null;
    sphere?: Sphere | null;
    role?: string;
    period?: { since: string; until: string } | null;
    words?: string[];
  };
}

const LAST_WEEK = { since: '2026-09-28', until: '2026-10-05' };
const YESTERDAY = { since: '2026-10-04', until: '2026-10-05' };
const SEPTEMBER = { since: '2026-09-01', until: '2026-10-01' };

export const SEARCH_GOLDEN: SearchLine[] = [
  // ---- English
  {
    query: 'photos from Sam',
    lang: 'en',
    expect: { scope: 'files', fileKind: 'image', person: 'Sam', words: [] },
  },
  {
    query: 'pdfs Maya sent',
    lang: 'en',
    expect: { scope: 'files', fileKind: 'pdf', person: 'Maya' },
  },
  {
    query: 'what did Omar say about the lease',
    lang: 'en',
    expect: { scope: 'messages', person: 'Omar', words: ['lease'] },
  },
  {
    query: 'what Sam asked me to do',
    lang: 'en',
    expect: { scope: 'tasks', person: 'Sam', direction: 'asked_me' },
  },
  {
    query: 'things I asked Maya for',
    lang: 'en',
    expect: { scope: 'tasks', person: 'Maya', direction: 'i_asked' },
  },
  { query: 'waiting on Omar', lang: 'en', expect: { scope: 'waiting', person: 'Omar' } },
  { query: 'my clients', lang: 'en', expect: { scope: 'people', sphere: 'customer' } },
  { query: 'my family', lang: 'en', expect: { scope: 'people', sphere: 'family' } },
  {
    query: 'decisions about the budget',
    lang: 'en',
    expect: { scope: 'decisions', words: ['budget'] },
  },
  {
    query: 'links from last week',
    lang: 'en',
    expect: { scope: 'links', period: LAST_WEEK, words: [] },
  },
  {
    query: 'voice notes from yesterday',
    lang: 'en',
    expect: { scope: 'files', fileKind: 'audio', period: YESTERDAY, words: [] },
  },
  { query: 'invoice 7731', lang: 'en', expect: { scope: 'all', words: ['invoice', '7731'] } },
  { query: 'videos', lang: 'en', expect: { scope: 'files', fileKind: 'video', words: [] } },
  {
    query: 'decisions in September',
    lang: 'en',
    expect: { scope: 'decisions', period: SEPTEMBER, words: [] },
  },
  {
    query: 'documents from Sam last month',
    lang: 'en',
    expect: { scope: 'files', fileKind: 'document', person: 'Sam', period: SEPTEMBER },
  },
  {
    query: 'my coworkers',
    lang: 'en',
    expect: { scope: 'people', sphere: 'work', role: 'colleague' },
  },

  // ---- Arabic
  {
    query: 'صور من أحمد',
    lang: 'ar',
    expect: { scope: 'files', fileKind: 'image', person: 'أحمد', words: [] },
  },
  {
    query: 'ملفات PDF بعتها سامي',
    lang: 'ar',
    expect: { scope: 'files', fileKind: 'pdf', person: 'سامي' },
  },
  {
    query: 'قال إيه عمر عن العقد',
    lang: 'ar',
    expect: { scope: 'messages', person: 'عمر', words: ['العقد'] },
  },
  {
    query: 'اللي طلبه مني كريم',
    lang: 'ar',
    expect: { scope: 'tasks', person: 'كريم', direction: 'asked_me' },
  },
  { query: 'مستني إيه من منى', lang: 'ar', expect: { scope: 'waiting', person: 'منى' } },
  { query: 'عملائي', lang: 'ar', expect: { scope: 'people', sphere: 'customer' } },
  { query: 'أهلي', lang: 'ar', expect: { scope: 'people', sphere: 'family' } },
  {
    query: 'القرارات بخصوص الميزانية',
    lang: 'ar',
    expect: { scope: 'decisions', words: ['الميزانية'] },
  },
  {
    query: 'روابط الأسبوع اللي فات',
    lang: 'ar',
    expect: { scope: 'links', period: LAST_WEEK, words: [] },
  },
  {
    query: 'فويسات امبارح',
    lang: 'ar',
    expect: { scope: 'files', fileKind: 'audio', period: YESTERDAY },
  },
  { query: 'فاتورة 7731', lang: 'ar', expect: { scope: 'all', words: ['فاتورة', '7731'] } },
  { query: 'فيديوهات', lang: 'ar', expect: { scope: 'files', fileKind: 'video', words: [] } },
  {
    query: 'قرارات في سبتمبر',
    lang: 'ar',
    expect: { scope: 'decisions', period: SEPTEMBER, words: [] },
  },
  {
    query: 'مستندات من سارة الشهر الماضي',
    lang: 'ar',
    expect: { scope: 'files', fileKind: 'document', person: 'سارة', period: SEPTEMBER },
  },
  {
    query: 'زملائي في الشغل',
    lang: 'ar',
    expect: { scope: 'people', sphere: 'work', role: 'colleague' },
  },
  {
    query: 'رسائل خالد عن السفر',
    lang: 'ar',
    expect: { scope: 'messages', person: 'خالد', words: ['السفر'] },
  },

  // ---- French
  {
    query: 'photos de Karim',
    lang: 'fr',
    expect: { scope: 'files', fileKind: 'image', person: 'Karim', words: [] },
  },
  {
    query: 'les PDF envoyés par Léa',
    lang: 'fr',
    expect: { scope: 'files', fileKind: 'pdf', person: 'Léa' },
  },
  {
    query: "ce qu'a dit Omar sur le bail",
    lang: 'fr',
    expect: { scope: 'messages', person: 'Omar', words: ['bail'] },
  },
  {
    query: "ce que Léa m'a demandé de faire",
    lang: 'fr',
    expect: { scope: 'tasks', person: 'Léa', direction: 'asked_me' },
  },
  { query: "ce que j'attends de Karim", lang: 'fr', expect: { scope: 'waiting', person: 'Karim' } },
  { query: 'mes clients', lang: 'fr', expect: { scope: 'people', sphere: 'customer' } },
  { query: 'ma famille', lang: 'fr', expect: { scope: 'people', sphere: 'family' } },
  {
    query: 'décisions concernant le budget',
    lang: 'fr',
    expect: { scope: 'decisions', words: ['budget'] },
  },
  {
    query: 'liens de la semaine dernière',
    lang: 'fr',
    expect: { scope: 'links', period: LAST_WEEK, words: [] },
  },
  {
    query: "messages vocaux d'hier",
    lang: 'fr',
    expect: { scope: 'files', fileKind: 'audio', period: YESTERDAY },
  },
  { query: 'facture 7731', lang: 'fr', expect: { scope: 'all', words: ['facture', '7731'] } },
  { query: 'vidéos', lang: 'fr', expect: { scope: 'files', fileKind: 'video', words: [] } },
  {
    query: 'décisions en septembre',
    lang: 'fr',
    expect: { scope: 'decisions', period: SEPTEMBER, words: [] },
  },
  {
    query: 'documents de Sarah le mois dernier',
    lang: 'fr',
    expect: { scope: 'files', fileKind: 'document', person: 'Sarah', period: SEPTEMBER },
  },
  {
    query: 'mes collègues',
    lang: 'fr',
    expect: { scope: 'people', sphere: 'work', role: 'colleague' },
  },
  {
    query: "ce que j'ai demandé à Hugo",
    lang: 'fr',
    expect: { scope: 'tasks', person: 'Hugo', direction: 'i_asked' },
  },

  // ---- Turkish
  {
    query: "Ahmet'in fotoğrafları",
    lang: 'tr',
    expect: { scope: 'files', fileKind: 'image', person: 'Ahmet', words: [] },
  },
  {
    query: "Elif'in gönderdiği PDF'ler",
    lang: 'tr',
    expect: { scope: 'files', fileKind: 'pdf', person: 'Elif' },
  },
  {
    query: 'Murat kira hakkında ne dedi',
    lang: 'tr',
    expect: { scope: 'messages', person: 'Murat', words: ['kira'] },
  },
  {
    query: "Elif'in benden istedikleri",
    lang: 'tr',
    expect: { scope: 'tasks', person: 'Elif', direction: 'asked_me' },
  },
  { query: "Murat'tan beklediklerim", lang: 'tr', expect: { scope: 'waiting', person: 'Murat' } },
  { query: 'müşterilerim', lang: 'tr', expect: { scope: 'people', sphere: 'customer' } },
  { query: 'ailem', lang: 'tr', expect: { scope: 'people', sphere: 'family' } },
  {
    query: 'bütçe hakkındaki kararlar',
    lang: 'tr',
    expect: { scope: 'decisions', words: ['bütçe'] },
  },
  {
    query: 'geçen haftaki bağlantılar',
    lang: 'tr',
    expect: { scope: 'links', period: LAST_WEEK, words: [] },
  },
  {
    query: 'dünkü sesli mesajlar',
    lang: 'tr',
    expect: { scope: 'files', fileKind: 'audio', period: YESTERDAY },
  },
  { query: 'fatura 7731', lang: 'tr', expect: { scope: 'all', words: ['fatura', '7731'] } },
  { query: 'videolar', lang: 'tr', expect: { scope: 'files', fileKind: 'video', words: [] } },
  {
    query: 'eylüldeki kararlar',
    lang: 'tr',
    expect: { scope: 'decisions', period: SEPTEMBER, words: [] },
  },
  {
    query: "Ayşe'nin geçen ayki belgeleri",
    lang: 'tr',
    expect: { scope: 'files', fileKind: 'document', person: 'Ayşe', period: SEPTEMBER },
  },
  {
    query: 'iş arkadaşlarım',
    lang: 'tr',
    expect: { scope: 'people', sphere: 'work', role: 'colleague' },
  },
  {
    query: "Can'dan istediklerim",
    lang: 'tr',
    expect: { scope: 'tasks', person: 'Can', direction: 'i_asked' },
  },
];
