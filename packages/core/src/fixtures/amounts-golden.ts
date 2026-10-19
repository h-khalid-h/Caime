/**
 * Amounts in what people write, labelled by hand (M16 G10, review 2026-10-17 §5 M: "amounts …
 * unmeasured"): what someone reading the line would call money, with its value and its currency as
 * the words say it. A sign or a word several currencies share ("$", "dinar", "ريال") means the
 * writer's own, `currency`; a bare number in a sentence about money has none. Nearly half the
 * lines hold numbers that aren't money: times, phone numbers, counts, versions, percentages,
 * floors, order numbers, ages. Written before the rules were measured on them;
 * `amounts-golden.test.ts` holds precision and recall per language to floors set at what was
 * measured, only ever raised.
 */
export interface AmountLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  /** The writer's own currency (ISO 4217). */
  currency: string;
  amounts: Array<{ value: number; currency: string | null }>;
}

export const AMOUNTS_GOLDEN: AmountLine[] = [
  // ---- English
  {
    text: 'The total is $1,250.50',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 1250.5, currency: 'USD' }],
  },
  {
    text: 'I paid 40 dollars for the tickets',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 40, currency: 'USD' }],
  },
  {
    text: "It's €300 for the weekend",
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 300, currency: 'EUR' }],
  },
  {
    text: 'Send me 2k when you can',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 2000, currency: null }],
  },
  {
    text: 'Rent is 1500 a month',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 1500, currency: null }],
  },
  {
    text: 'Can you lend me £50?',
    lang: 'en',
    currency: 'GBP',
    amounts: [{ value: 50, currency: 'GBP' }],
  },
  {
    text: 'The flight was 3,200 AED',
    lang: 'en',
    currency: 'AED',
    amounts: [{ value: 3200, currency: 'AED' }],
  },
  {
    text: 'I owe you $20 and Sam owes you $15',
    lang: 'en',
    currency: 'USD',
    amounts: [
      { value: 20, currency: 'USD' },
      { value: 15, currency: 'USD' },
    ],
  },
  {
    text: 'The quote came in at USD 4,800',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 4800, currency: 'USD' }],
  },
  {
    text: 'Price: 250 EGP per person',
    lang: 'en',
    currency: 'EGP',
    amounts: [{ value: 250, currency: 'EGP' }],
  },
  {
    text: 'Two hundred dollars is too much',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 200, currency: 'USD' }],
  },
  {
    text: 'The deposit is $1.2k',
    lang: 'en',
    currency: 'USD',
    amounts: [{ value: 1200, currency: 'USD' }],
  },
  {
    text: 'It came to C$45 with tax',
    lang: 'en',
    currency: 'CAD',
    amounts: [{ value: 45, currency: 'CAD' }],
  },
  { text: 'Meet me at 5:30 at gate 12', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'Call me on 555-0134', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'We need 3 boxes and 12 chairs', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'Version 2.5 is out', lang: 'en', currency: 'USD', amounts: [] },
  { text: "That's 15% off", lang: 'en', currency: 'USD', amounts: [] },
  { text: 'Room 404, floor 3', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'Back in 10 minutes', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'Order #48213 shipped', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'She turns 30 on Friday', lang: 'en', currency: 'USD', amounts: [] },
  // A number after a word about money that isn't money (added with the rule for bare amounts).
  { text: 'Send me 3 photos of the flat', lang: 'en', currency: 'USD', amounts: [] },
  { text: 'I paid for 2 tickets', lang: 'en', currency: 'USD', amounts: [] },

  // ---- Arabic
  {
    text: 'الحساب ٣٥٠ جنيه',
    lang: 'ar',
    currency: 'EGP',
    amounts: [{ value: 350, currency: 'EGP' }],
  },
  {
    text: 'دفعت ١٢٠٠ ريال للفندق',
    lang: 'ar',
    currency: 'SAR',
    amounts: [{ value: 1200, currency: 'SAR' }],
  },
  {
    text: 'المبلغ 5000 درهم',
    lang: 'ar',
    currency: 'AED',
    amounts: [{ value: 5000, currency: 'AED' }],
  },
  {
    text: 'حولتلك 200 دولار',
    lang: 'ar',
    currency: 'EGP',
    amounts: [{ value: 200, currency: 'USD' }],
  },
  {
    text: 'السعر ٤٥ دينار',
    lang: 'ar',
    currency: 'KWD',
    amounts: [{ value: 45, currency: 'KWD' }],
  },
  {
    text: 'الإيجار ٧ آلاف جنيه في الشهر',
    lang: 'ar',
    currency: 'EGP',
    amounts: [{ value: 7000, currency: 'EGP' }],
  },
  {
    text: 'التذكرة بـ ١٥٠ ألف ليرة',
    lang: 'ar',
    currency: 'LBP',
    amounts: [{ value: 150000, currency: 'LBP' }],
  },
  {
    text: 'الفاتورة 1,250.75 جنيه',
    lang: 'ar',
    currency: 'EGP',
    amounts: [{ value: 1250.75, currency: 'EGP' }],
  },
  { text: 'بعتلك ٥٠٠ ج', lang: 'ar', currency: 'EGP', amounts: [{ value: 500, currency: 'EGP' }] },
  {
    text: 'المجموع ٣٠٠ يورو',
    lang: 'ar',
    currency: 'EGP',
    amounts: [{ value: 300, currency: 'EUR' }],
  },
  {
    text: 'سعر الكيلو ٨٥ جنيه والتوصيل ٢٠ جنيه',
    lang: 'ar',
    currency: 'EGP',
    amounts: [
      { value: 85, currency: 'EGP' },
      { value: 20, currency: 'EGP' },
    ],
  },
  {
    text: 'خلي الميزانية في حدود ١٠ آلاف ريال',
    lang: 'ar',
    currency: 'SAR',
    amounts: [{ value: 10000, currency: 'SAR' }],
  },
  { text: 'ادفعلي ٢٥٠', lang: 'ar', currency: 'EGP', amounts: [{ value: 250, currency: null }] },
  { text: 'مية جنيه بس', lang: 'ar', currency: 'EGP', amounts: [{ value: 100, currency: 'EGP' }] },
  { text: 'الاجتماع الساعة ٥', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'رقمي ٠١٠٠١٢٣٤٥٦٧', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'عندي ٣ أولاد', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'خصم ٢٠٪', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'الشقة في الدور ٤', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'الطلب رقم ٣٤٥٦', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'هرجع بعد ١٠ دقايق', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'عمره ٣٠ سنة', lang: 'ar', currency: 'EGP', amounts: [] },
  { text: 'حولت ٣ ملفات للأرشيف', lang: 'ar', currency: 'EGP', amounts: [] },

  // ---- French
  { text: 'Ça fait 45 €', lang: 'fr', currency: 'EUR', amounts: [{ value: 45, currency: 'EUR' }] },
  {
    text: 'Le loyer est de 1 200 euros',
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 1200, currency: 'EUR' }],
  },
  {
    text: "Je t'ai envoyé 3 000 dirhams",
    lang: 'fr',
    currency: 'MAD',
    amounts: [{ value: 3000, currency: 'MAD' }],
  },
  {
    text: "C'est 25,50 € par personne",
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 25.5, currency: 'EUR' }],
  },
  {
    text: 'Le billet coûte 80 dinars',
    lang: 'fr',
    currency: 'TND',
    amounts: [{ value: 80, currency: 'TND' }],
  },
  {
    text: "Ça m'a coûté 3 mille euros",
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 3000, currency: 'EUR' }],
  },
  {
    text: "Le devis s'élève à 4 800 € HT",
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 4800, currency: 'EUR' }],
  },
  {
    text: 'Prix : 120 CHF',
    lang: 'fr',
    currency: 'CHF',
    amounts: [{ value: 120, currency: 'CHF' }],
  },
  {
    text: "J'ai payé 60 $ sur le site",
    lang: 'fr',
    currency: 'CAD',
    amounts: [{ value: 60, currency: 'CAD' }],
  },
  {
    text: 'Envoie-moi 200 euros demain',
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 200, currency: 'EUR' }],
  },
  {
    text: "1,5 million d'euros de chiffre d'affaires",
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 1_500_000, currency: 'EUR' }],
  },
  {
    text: "deux cents euros, c'est trop",
    lang: 'fr',
    currency: 'EUR',
    amounts: [{ value: 200, currency: 'EUR' }],
  },
  { text: 'Rendez-vous à 14h30', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'Appelle-moi au 06 12 34 56 78', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'On sera 12 à table', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'Remise de 15 %', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'Il habite au 5 rue Victor Hugo', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'La facture n° 2024-118', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'Version 3.2 du fichier', lang: 'fr', currency: 'EUR', amounts: [] },
  { text: "J'arrive dans 10 minutes", lang: 'fr', currency: 'EUR', amounts: [] },
  { text: 'Envoie-moi 3 photos', lang: 'fr', currency: 'EUR', amounts: [] },

  // ---- Turkish
  {
    text: 'Toplam 1.250 TL',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 1250, currency: 'TRY' }],
  },
  {
    text: 'Kira 15.000 lira',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 15000, currency: 'TRY' }],
  },
  { text: 'Bilet 350 ₺', lang: 'tr', currency: 'TRY', amounts: [{ value: 350, currency: 'TRY' }] },
  {
    text: '100 dolar gönderdim',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 100, currency: 'USD' }],
  },
  {
    text: 'Otel gecelik 80 euro',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 80, currency: 'EUR' }],
  },
  {
    text: 'Fatura 2.499,90 TL',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 2499.9, currency: 'TRY' }],
  },
  {
    text: 'Bana 500 lira borcun var',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 500, currency: 'TRY' }],
  },
  {
    text: 'Bin lira yeter',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 1000, currency: 'TRY' }],
  },
  {
    text: "Fiyatı 45 TL'den 39 TL'ye düştü",
    lang: 'tr',
    currency: 'TRY',
    amounts: [
      { value: 45, currency: 'TRY' },
      { value: 39, currency: 'TRY' },
    ],
  },
  {
    text: 'Kapora 2 bin TL',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 2000, currency: 'TRY' }],
  },
  {
    text: 'Yaklaşık 300 sterlin',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 300, currency: 'GBP' }],
  },
  {
    text: '1,5 milyon TL',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 1_500_000, currency: 'TRY' }],
  },
  {
    text: 'Hesap 750₺ tuttu',
    lang: 'tr',
    currency: 'TRY',
    amounts: [{ value: 750, currency: 'TRY' }],
  },
  { text: "Saat 15:30'da buluşalım", lang: 'tr', currency: 'TRY', amounts: [] },
  { text: 'Numaram 0532 123 45 67', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: '3 kutu lazım', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: '%20 indirim var', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: 'Toplantı 4. katta', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: 'Sipariş no 34567', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: 'Sürüm 2.1 çıktı', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: '10 dakikaya gelirim', lang: 'tr', currency: 'TRY', amounts: [] },
  { text: 'Kira 3 ay sonra artacak', lang: 'tr', currency: 'TRY', amounts: [] },
];
