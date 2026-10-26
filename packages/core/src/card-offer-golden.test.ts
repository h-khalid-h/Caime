/**
 * Words become cards (M17 I9a), measured: each line, labelled by hand in every interface
 * language, with the near misses a rule must not catch (a plan already past, one called off, a
 * meeting talked about, money without an amount, an amount nobody asks for). Every line must read
 * as labelled; a new cue brings its line here, and the near miss beside it.
 */
import { describe, expect, it } from 'vitest';
import { cardOfferIn } from './card-offer';
import type { Repeat } from './repeat';

/** Monday 26 October 2026, 11:00 in Cairo. */
const NOW = new Date('2026-10-26T09:00:00Z');

type Want =
  | null
  | { meeting: string; repeat?: Repeat }
  | { pay: 'ask' | 'send'; value: number; currency?: string };

const LINES: Array<[string, string, Want]> = [
  // English
  ['en', "Let's meet Thursday at 3pm", { meeting: '2026-10-29 15:00' }],
  ['en', 'Can we catch up tomorrow at 10?', { meeting: '2026-10-27 10:00' }],
  ['en', 'Shall we grab coffee on Friday at 9:30?', { meeting: '2026-10-30 09:30' }],
  ['en', 'Are you free Wednesday at 4?', { meeting: '2026-10-28 16:00' }],
  ['en', "Let's set up a call for Thursday 11am", { meeting: '2026-10-29 11:00' }],
  ['en', 'Send me 200 EGP when you can', { pay: 'ask', value: 200, currency: 'EGP' }],
  ['en', 'You owe me $45 for the tickets', { pay: 'ask', value: 45, currency: 'USD' }],
  ['en', "I'll send you 1,500 EGP tonight", { pay: 'send', value: 1500, currency: 'EGP' }],
  ['en', 'I owe you €30 for lunch', { pay: 'send', value: 30, currency: 'EUR' }],
  ['en', 'We met last Thursday at 3', null],
  ['en', "I can't meet Thursday at 3, sorry", null],
  ['en', 'The meeting on Thursday was cancelled', null],
  ['en', "Let's meet sometime", null],
  ['en', 'Send me the file please', null],
  ['en', 'The dinner cost 300 EGP', null],
  ['en', "I'll pay you back next week", null],
  ['en', "Let's meet at the station", null],
  // English, a plan that repeats (M17 I9c): its first time, and how often.
  ['en', "Let's meet every Monday at 10am", { meeting: '2026-11-02 10:00', repeat: 'week' }],
  [
    'en',
    'Can we have a call every other Thursday at 3pm?',
    { meeting: '2026-10-29 15:00', repeat: 'fortnight' },
  ],
  [
    'en',
    "Let's do a weekly call on Tuesdays at 9",
    { meeting: '2026-10-27 09:00', repeat: 'week' },
  ],
  ['en', "Let's meet every weekday at 9am", { meeting: '2026-10-27 09:00', repeat: 'workday' }],
  ['en', "Let's catch up monthly, Friday at 2pm", { meeting: '2026-10-30 14:00', repeat: 'month' }],
  ['en', "Let's meet on Monday at 10am", { meeting: '2026-11-02 10:00' }],
  ['en', 'I go to the gym every Monday at 7', null],
  // Arabic
  ['ar', 'نتقابل بكرة الساعة 3؟', { meeting: '2026-10-27 15:00' }],
  ['ar', 'خلينا نتكلم يوم الخميس الساعة 5', { meeting: '2026-10-29 17:00' }],
  ['ar', 'يلا نشرب قهوة بكرة الساعة 10', { meeting: '2026-10-27 10:00' }],
  ['ar', 'ابعتلي 200 جنيه لما تقدر', { pay: 'ask', value: 200, currency: 'EGP' }],
  ['ar', 'حولي 500 جنيه بكرة', { pay: 'ask', value: 500, currency: 'EGP' }],
  ['ar', 'هحولك 1000 جنيه بالليل', { pay: 'send', value: 1000, currency: 'EGP' }],
  ['ar', 'مش هقدر نتقابل بكرة الساعة 3', null],
  ['ar', 'الاجتماع اتلغى بكرة', null],
  ['ar', 'حوالي 200 جنيه', null],
  ['ar', 'ابعتلي الملف', null],
  ['ar', 'دفعت 200 جنيه امبارح', null],
  ['ar', 'خلينا نتقابل كل اثنين الساعة 10', { meeting: '2026-11-02 10:00', repeat: 'week' }],
  [
    'ar',
    'نتكلم كل أسبوعين يوم الخميس الساعة 5',
    { meeting: '2026-10-29 17:00', repeat: 'fortnight' },
  ],
  [
    'ar',
    'خلينا نعمل اجتماع كل شهر يوم الأحد الساعة 11',
    { meeting: '2026-11-01 11:00', repeat: 'month' },
  ],
  ['ar', 'بروح الجيم كل اثنين الساعة 7', null],
  // French
  ['fr', 'On se voit jeudi à 15h ?', { meeting: '2026-10-29 15:00' }],
  ['fr', 'On prend un café demain à 10h ?', { meeting: '2026-10-27 10:00' }],
  ['fr', 'Tu es dispo vendredi à 14h ?', { meeting: '2026-10-30 14:00' }],
  ['fr', 'Tu me dois 50 €', { pay: 'ask', value: 50, currency: 'EUR' }],
  ['fr', 'Je te rembourse 30 € ce soir', { pay: 'send', value: 30, currency: 'EUR' }],
  ['fr', 'On se voit pas jeudi, désolé', null],
  ['fr', 'Le rendez-vous de jeudi est annulé', null],
  ['fr', 'Envoie-moi le document', null],
  ['fr', "J'ai payé 40 € hier", null],
  ['fr', 'On se voit tous les lundis à 10h ?', { meeting: '2026-11-02 10:00', repeat: 'week' }],
  [
    'fr',
    'On fait un point un jeudi sur deux à 15h',
    { meeting: '2026-10-29 15:00', repeat: 'fortnight' },
  ],
  [
    'fr',
    'On se retrouve chaque semaine, vendredi à 9h',
    { meeting: '2026-10-30 09:00', repeat: 'week' },
  ],
  [
    'fr',
    'On se voit du lundi au vendredi à 9h',
    { meeting: '2026-10-27 09:00', repeat: 'workday' },
  ],
  ['fr', 'Je vais au sport tous les lundis à 19h', null],
  // Turkish
  ['tr', "Yarın saat 3'te buluşalım", { meeting: '2026-10-27 15:00' }],
  ['tr', 'Perşembe 10:00 görüşelim mi?', { meeting: '2026-10-29 10:00' }],
  ['tr', 'Bana 300 TL gönder', { pay: 'ask', value: 300, currency: 'TRY' }],
  ['tr', 'Sana 250 TL gönderirim', { pay: 'send', value: 250, currency: 'TRY' }],
  ['tr', 'Yarınki toplantı iptal edildi', null],
  ['tr', 'Bana dosyayı gönder', null],
  ['tr', 'Dün 200 TL ödedim', null],
  ['tr', 'Her pazartesi saat 10:00 görüşelim', { meeting: '2026-11-02 10:00', repeat: 'week' }],
  [
    'tr',
    'Perşembe saat 15:00, iki haftada bir toplanalım',
    { meeting: '2026-10-29 15:00', repeat: 'fortnight' },
  ],
  ['tr', 'Ayda bir buluşalım, cuma saat 14:00', { meeting: '2026-10-30 14:00', repeat: 'month' }],
  ['tr', 'Her pazartesi saat 7 spora gidiyorum', null],
];

const LOCALES: Record<string, string> = { en: 'en-GB', ar: 'ar-EG', fr: 'fr-FR', tr: 'tr-TR' };
const CURRENCY: Record<string, string> = { en: 'EGP', ar: 'EGP', fr: 'EUR', tr: 'TRY' };

describe('words become cards (M17 I9a, I9c)', () => {
  for (const [lang, text, want] of LINES)
    it(`${lang}: ${text}`, () => {
      const got = cardOfferIn(text, {
        now: NOW,
        timeZone:
          lang === 'fr' ? 'Europe/Paris' : lang === 'tr' ? 'Europe/Istanbul' : 'Africa/Cairo',
        locale: LOCALES[lang],
        currency: CURRENCY[lang],
      });
      if (want === null) return expect(got).toBeNull();
      if ('meeting' in want) {
        expect(got?.kind).toBe('meeting');
        if (got?.kind === 'meeting') {
          expect(`${got.when.date} ${got.when.time}`).toBe(want.meeting);
          expect(got.repeat ?? null).toBe(want.repeat ?? null);
        }
        return;
      }
      expect(got?.kind).toBe('pay');
      if (got?.kind !== 'pay') return;
      expect(got.direction).toBe(want.pay);
      expect(got.amount.value).toBe(want.value);
      if (want.currency) expect(got.amount.currency).toBe(want.currency);
    });
});
