/**
 * What search finds in each interface language (M17 I5, convention 17): a line someone wrote and
 * a query someone typed, labelled by hand with whether the one finds the other. Written apart from
 * the fold, before it was measured; `retrieval-golden.test.ts` holds every language to all of its
 * lines (these are rules, not a model: one wrong line fails), sends each `stored` as a message and
 * asks `GET /v1/search?q=` for each query. A `finds: false` line is the near miss the fold must not
 * make (a suffix is not a prefix, a different letter is a different word). Arabic's article and a
 * joined "و" come off a word as the index holds it (`caime_find_text`), so a word typed bare finds
 * it as written, as WhatsApp's substring search does; a word's end still never matches.
 */
export interface RetrievalLine {
  lang: 'ar' | 'fr' | 'tr' | 'en';
  /** What was written. */
  stored: string;
  /** What was typed. */
  query: string;
  finds: boolean;
  why: string;
}

export const RETRIEVAL_GOLDEN: RetrievalLine[] = [
  // ---- Arabic: hamza forms, taa marbuta, alef maqsura, marks, tatweel, prefixes
  {
    lang: 'ar',
    stored: 'أحمد قال إن العقد جاهز',
    query: 'احمد',
    finds: true,
    why: 'alef with hamza above, typed bare',
  },
  {
    lang: 'ar',
    stored: 'احمد بعت الفاتورة',
    query: 'أحمد',
    finds: true,
    why: 'bare alef, typed with hamza',
  },
  { lang: 'ar', stored: 'إبراهيم وصل', query: 'ابراهيم', finds: true, why: 'hamza below' },
  {
    lang: 'ar',
    stored: 'آمنة حجزت الموعد',
    query: 'امنه',
    finds: true,
    why: 'madda and taa marbuta',
  },
  {
    lang: 'ar',
    stored: 'فاطمة هتيجي بكرة',
    query: 'فاطمه',
    finds: true,
    why: 'taa marbuta typed as haa',
  },
  {
    lang: 'ar',
    stored: 'مصطفى بعتلك الملف',
    query: 'مصطفي',
    finds: true,
    why: 'alef maqsura typed as yaa',
  },
  {
    lang: 'ar',
    stored: 'ليلي جاهزة',
    query: 'ليلى',
    finds: true,
    why: 'yaa typed as alef maqsura',
  },
  {
    lang: 'ar',
    stored: 'مُحَمَّد اتصل بيك',
    query: 'محمد',
    finds: true,
    why: 'written with its marks',
  },
  {
    lang: 'ar',
    stored: 'محـــمد قال موافق',
    query: 'محمد',
    finds: true,
    why: 'stretched with tatweel',
  },
  {
    lang: 'ar',
    stored: 'ٱلعقد اتوقّع الأسبوع الجاي',
    query: 'العقد',
    finds: true,
    why: 'alef wasla',
  },
  {
    lang: 'ar',
    stored: 'بعتنا العرض للعميل',
    query: 'عرض',
    finds: true,
    why: 'the word without its article',
  },
  {
    lang: 'ar',
    stored: 'بعتنا العرض للعميل',
    query: 'عميل',
    finds: true,
    why: '"لل" off the word',
  },
  {
    lang: 'ar',
    stored: 'بعتنا العرض للعميل',
    query: 'لعرض',
    finds: false,
    why: 'the article cut in its middle is no word',
  },
  { lang: 'ar', stored: 'وقّعنا والعقد معاك', query: 'عقد', finds: true, why: '"وال" off the word' },
  {
    lang: 'ar',
    stored: 'أنا وأحمد هنيجي',
    query: 'احمد',
    finds: true,
    why: 'a joined "و" off a name',
  },
  { lang: 'ar', stored: 'بالعربي أسهل', query: 'عربي', finds: true, why: '"بال" off the word' },
  {
    lang: 'ar',
    stored: 'سئل عن السعر',
    query: 'سيل',
    finds: false,
    why: 'a hamza seat is a letter of its own',
  },
  {
    lang: 'ar',
    stored: 'أحمد قال إن العقد جاهز',
    query: 'حمد',
    finds: false,
    why: 'a suffix never finds',
  },
  {
    lang: 'ar',
    stored: 'الموعد يوم الخميس',
    query: 'موعد',
    finds: true,
    why: 'the word without its article',
  },
  { lang: 'ar', stored: 'الموعد يوم الخميس', query: 'الموع', finds: true, why: 'a prefix finds' },
  {
    lang: 'ar',
    stored: 'بعتلك الفاتورة رقم 7731',
    query: '7731',
    finds: true,
    why: 'a number as written',
  },
  {
    lang: 'ar',
    stored: 'سلمى سألت عن السعر',
    query: 'سلمي',
    finds: true,
    why: 'a name with alef maqsura',
  },

  // ---- French: accents, elision, œ
  {
    lang: 'fr',
    stored: 'On se voit au café demain',
    query: 'cafe',
    finds: true,
    why: 'accent left out',
  },
  {
    lang: 'fr',
    stored: 'On se voit au cafe demain',
    query: 'café',
    finds: true,
    why: 'accent typed',
  },
  {
    lang: 'fr',
    stored: "L'élève a rendu le devoir",
    query: 'eleve',
    finds: true,
    why: 'elision cut, accents folded',
  },
  { lang: 'fr', stored: 'Joyeux Noël à tous', query: 'noel', finds: true, why: 'diaeresis' },
  {
    lang: 'fr',
    stored: 'Son œuvre est terminée',
    query: 'oeuvre',
    finds: true,
    why: 'œ typed as oe',
  },
  { lang: 'fr', stored: 'Le contrat est prêt', query: 'pret', finds: true, why: 'circumflex' },
  {
    lang: 'fr',
    stored: 'Hélène a signé',
    query: 'helene',
    finds: true,
    why: 'a name without its accents',
  },
  {
    lang: 'fr',
    stored: 'Réunion déplacée à mardi',
    query: 'reunion',
    finds: true,
    why: 'the first word',
  },
  {
    lang: 'fr',
    stored: 'Réunion déplacée à mardi',
    query: 'union',
    finds: false,
    why: 'a suffix never finds',
  },
  {
    lang: 'fr',
    stored: 'La facture FAC-8841-18 est payée',
    query: '8841',
    finds: true,
    why: 'a joined reference, each part a word',
  },
  {
    lang: 'fr',
    stored: 'Le contrat est prêt',
    query: 'près',
    finds: false,
    why: 'another word, folded alike but not the same',
  },

  // ---- Turkish: dotted and dotless i, ş ğ ü ö ç
  {
    lang: 'tr',
    stored: 'İstanbul toplantısı cuma',
    query: 'istanbul',
    finds: true,
    why: 'dotted capital İ',
  },
  {
    lang: 'tr',
    stored: 'Işık fotoğrafları gönderdi',
    query: 'isik',
    finds: true,
    why: 'dotless ı and İ as i',
  },
  { lang: 'tr', stored: 'Gül ödemeyi yaptı', query: 'gul', finds: true, why: 'ü typed as u' },
  { lang: 'tr', stored: 'Şeker siparişi hazır', query: 'seker', finds: true, why: 'ş typed as s' },
  { lang: 'tr', stored: 'Ağaç dikimi pazartesi', query: 'agac', finds: true, why: 'ğ and ç' },
  { lang: 'tr', stored: 'Çay saatinde görüşürüz', query: 'cay', finds: true, why: 'ç' },
  { lang: 'tr', stored: 'Öğle yemeği 12:30', query: 'ogle', finds: true, why: 'ö and ğ' },
  { lang: 'tr', stored: 'Gül ödemeyi yaptı', query: 'Gül', finds: true, why: 'typed as written' },
  { lang: 'tr', stored: 'Sözleşme imzalandı', query: 'sozlesme', finds: true, why: 'ö and ş' },
  {
    lang: 'tr',
    stored: 'Sözleşme imzalandı',
    query: 'lesme',
    finds: false,
    why: 'a suffix never finds',
  },
  {
    lang: 'tr',
    stored: 'Fatura INV-7731 ödendi',
    query: 'inv',
    finds: true,
    why: 'a joined reference',
  },

  // ---- English: case, joiners, accents in borrowed names
  {
    lang: 'en',
    stored: 'The Contract is ready to sign',
    query: 'contract',
    finds: true,
    why: 'case',
  },
  {
    lang: 'en',
    stored: 'Invoice INV-7731 is paid',
    query: '7731',
    finds: true,
    why: 'a joined reference, each part a word',
  },
  {
    lang: 'en',
    stored: 'Invoice INV-7731 is paid',
    query: 'INV-7731',
    finds: true,
    why: 'the reference as written',
  },
  {
    lang: 'en',
    stored: 'José sent the deck',
    query: 'jose',
    finds: true,
    why: 'an accent in a name',
  },
  { lang: 'en', stored: 'Lunch with Zoë on Friday', query: 'zoe', finds: true, why: 'a diaeresis' },
  {
    lang: 'en',
    stored: 'See you at nile.dental tomorrow',
    query: 'dental',
    finds: true,
    why: 'a host, each part a word',
  },
  {
    lang: 'en',
    stored: 'The Contract is ready to sign',
    query: 'tract',
    finds: false,
    why: 'a suffix never finds',
  },
  {
    lang: 'en',
    stored: 'The Contract is ready to sign',
    query: 'contracts',
    finds: false,
    why: 'a longer word is not a prefix',
  },
  {
    lang: 'en',
    stored: "Sarah's keys are at the desk",
    query: 'sarah',
    finds: true,
    why: 'a possessive',
  },
];
