/**
 * Whom a group message speaks to (M17 I10), measured: each line of a group in each interface
 * language with the people it's said to, by hand, and the near misses that speak of someone
 * without speaking to them. Nobody wrong is ever named; every line is read right.
 */
import { describe, expect, it } from 'vitest';
import { type Addressable, addressedIn } from './addressees';

type Lang = 'en' | 'ar' | 'fr' | 'tr';
const PEOPLE: Record<Lang, Addressable[]> = {
  en: [
    { id: 'sara', names: ['Sara Haddad'] },
    { id: 'omar', names: ['Omar Nabil', 'omar.n'] },
    { id: 'leila', names: ['Leila Ben Ali', 'Lulu'] },
  ],
  ar: [
    { id: 'sara', names: ['سارة حداد'] },
    { id: 'omar', names: ['عمر نبيل'] },
    { id: 'leila', names: ['ليلى بن علي'] },
  ],
  fr: [
    { id: 'lea', names: ['Léa Martin'] },
    { id: 'omar', names: ['Omar Nabil'] },
    { id: 'sara', names: ['Sara Haddad'] },
  ],
  tr: [
    { id: 'ayse', names: ['Ayşe Yılmaz'] },
    { id: 'mehmet', names: ['Mehmet Kaya'] },
    { id: 'elif', names: ['Elif Demir'] },
  ],
};

interface Line {
  text: string;
  lang: Lang;
  to?: string[];
  everyone?: true;
}

const LINES: Line[] = [
  { text: 'Sara, can you send the deck by Friday?', lang: 'en', to: ['sara'] },
  { text: 'Can you send the deck by Friday, Sara?', lang: 'en', to: ['sara'] },
  { text: "Hey Omar, I'll send you the contract tomorrow", lang: 'en', to: ['omar'] },
  { text: 'Lulu, can you book the table?', lang: 'en', to: ['leila'] },
  { text: 'Thanks Leila. Omar, could you check the numbers?', lang: 'en', to: ['omar'] },
  { text: 'Everyone, please send your slides by Thursday', lang: 'en', everyone: true },
  { text: 'Can everyone confirm by tonight?', lang: 'en', everyone: true },
  { text: '@all please check the doc before the call', lang: 'en', everyone: true },
  { text: 'Can you send the deck to Sara?', lang: 'en' },
  { text: "Sara said she'd send it tomorrow", lang: 'en' },
  { text: 'Ok, can you send it?', lang: 'en' },
  { text: "I told Omar, he'll call you", lang: 'en' },
  { text: 'Everyone loved the venue', lang: 'en' },

  { text: 'يا سارة ممكن تبعتي العرض بكرة؟', lang: 'ar', to: ['sara'] },
  { text: 'سارة، ممكن تبعتي الملف؟', lang: 'ar', to: ['sara'] },
  { text: 'هبعتلك العقد بكرة يا عمر', lang: 'ar', to: ['omar'] },
  { text: 'يا جماعة كل واحد يبعت الصور النهارده', lang: 'ar', everyone: true },
  { text: 'ممكن كلكم تأكدوا قبل الخميس؟', lang: 'ar', everyone: true },
  { text: 'ابعت العرض لسارة', lang: 'ar' },
  { text: 'سارة قالت هتبعته بكرة', lang: 'ar' },
  { text: 'يا ريت نخلص النهارده', lang: 'ar' },

  { text: 'Léa, tu peux envoyer le devis demain ?', lang: 'fr', to: ['lea'] },
  { text: "Tu peux m'envoyer le devis, Omar ?", lang: 'fr', to: ['omar'] },
  { text: "Merci Sara, je t'envoie le contrat demain", lang: 'fr', to: ['sara'] },
  { text: "Tout le monde, merci d'envoyer vos photos avant vendredi", lang: 'fr', everyone: true },
  { text: 'Vous tous, pensez à confirmer avant ce soir', lang: 'fr', everyone: true },
  { text: 'Tu peux envoyer le devis à Omar ?', lang: 'fr' },
  { text: "Léa a dit qu'elle l'enverrait", lang: 'fr' },

  { text: 'Ayşe, raporu yarın gönderir misin?', lang: 'tr', to: ['ayse'] },
  { text: 'Raporu yarın gönderir misin, Mehmet?', lang: 'tr', to: ['mehmet'] },
  { text: 'Arkadaşlar, slaytları cumaya kadar gönderin', lang: 'tr', everyone: true },
  { text: 'Hepiniz yarın toplantıya gelin', lang: 'tr', everyone: true },
  { text: "Raporu Ayşe'ye gönderir misin?", lang: 'tr' },
  { text: 'Mehmet yarın gönderecekmiş', lang: 'tr' },
];

describe('whom a group message speaks to (M17 I10)', () => {
  for (const lang of ['en', 'ar', 'fr', 'tr'] as const) {
    it(`${lang}: each line names whom it's said to, and nobody it only speaks of`, () => {
      const wrong: string[] = [];
      for (const line of LINES.filter((l) => l.lang === lang)) {
        const got = addressedIn(line.text, PEOPLE[lang]);
        const want = { ids: line.to ?? [], everyone: Boolean(line.everyone) };
        if (
          got.everyone !== want.everyone ||
          got.ids.length !== want.ids.length ||
          got.ids.some((id) => !want.ids.includes(id))
        )
          wrong.push(`  ${line.text} → ${JSON.stringify(got)} (wanted ${JSON.stringify(want)})`);
      }
      expect(wrong, wrong.join('\n')).toEqual([]);
    });
  }

  it('names nobody by a first name two people share, and takes a full name', () => {
    const two: Addressable[] = [
      { id: 'a', names: ['Sara Haddad'] },
      { id: 'b', names: ['Sara Lopez'] },
    ];
    expect(addressedIn('Sara, can you send it?', two).ids).toEqual([]);
    expect(addressedIn('Sara Lopez, can you send it?', two).ids).toEqual(['b']);
  });
});
