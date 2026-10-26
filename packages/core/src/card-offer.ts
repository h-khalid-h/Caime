/**
 * Words become cards (M17 I9a): what someone is writing, read as a card it could be. A proposal
 * to meet with a day or a time ("let's meet Thursday at 3", "نتقابل بكرة الساعة 3", "on se voit
 * jeudi à 15h", "yarın saat 3'te buluşalım") offers a Meeting card at that time; an amount asked
 * for or offered ("send me 200", "ابعتلي 200 جنيه", "je te dois 50 €", "sana 300 TL gönderirim")
 * a Pay card that way. Rules only, in every interface language, measured by its golden lines
 * (`card-offer-golden.test.ts`); nothing is sent by it: the composer offers the card, filled, and
 * the person sends it or not (R12, R110). A negation or a cancellation in the words offers none.
 */
import { type Amount, extractAmounts } from './amounts';
import type { Repeat } from './repeat';
import { firstFutureWhen, type WhenMatch, type WhenOptions } from './when';

export type CardOffer =
  | { kind: 'meeting'; when: WhenMatch; repeat?: Repeat }
  | { kind: 'pay'; direction: 'ask' | 'send'; amount: Amount };

const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const words = (list: string) => new RegExp(`${B}(?:${list})${E}`, 'iu');

/** A proposal to meet or talk, in the four languages, never one already past. */
const MEET = words(
  [
    // English: a proposal, an ask whether they're free, or a plan to set one up.
    "(?:let['’]?s|lets|shall we|can we|could we|should we|we could|wanna|want to)\\s+(?:\\w+\\s+){0,3}(?:meet|catch up|talk|call|chat|get together|have (?:a )?(?:call|chat|coffee|lunch|dinner)|grab (?:a )?(?:coffee|lunch|dinner|drink))",
    'meet (?:me|up)',
    'are you (?:free|around|available)',
    '(?:schedule|set up|book|arrange) (?:a )?(?:meeting|call)',
    // Arabic: we meet, talk, call, see each other, with any dialect's mark before it.
    '(?:خلينا|خلّينا|يلا|يلّا|تعال|ممكن)?\\s*(?:ه|ح|ب|راح\\s+|رح\\s+|منـ?)?(?:نتقابل|نتلاقى|نتلاقا|نلتقي|نلتقى|نتشاف|نشوف\\s+بعض|نجتمع|نتكلم|نتصل|نعمل\\s+(?:مكالمة|اجتماع|ميتنج|ميتينج)|نحكي|نقعد\\s+مع\\s+بعض|نشرب\\s+قهوة)',
    'نتقابلو|نتلاقاو|نشوفو\\s+بعض',
    '(?:انت|إنت|انتي|إنتي)?\\s*(?:فاضي|فاضية|متاح|متاحة|فاضيين)',
    // French.
    'on se (?:voit|retrouve|capte|parle|fait (?:un|une) (?:point|appel|visio|café|déj|dîner))',
    "on s['’]appelle",
    'on fait (?:un|une) (?:point|appel|visio|réunion|café)',
    'on (?:peut|pourrait) se voir',
    'on prend un café',
    "(?:tu es|t['’]es|vous êtes) dispo(?:nible)?s?",
    'rendez-vous|rdv',
    // Turkish.
    'buluşalım|görüşelim|toplanalım|konuşalım|kahve içelim|yemek yiyelim|buluşuruz',
    'buluşabilir miyiz|görüşebilir miyiz|müsait misin|müsait misiniz|toplantı yapalım',
  ].join('|'),
);

/** Words that take a plan back, or that tell of one gone. */
const MEET_NOT = words(
  [
    "can['’]?t|cannot|won['’]?t|couldn['’]?t|didn['’]?t|not|never|cancel(?:l?ed)?|postpone[ds]?",
    'مش|مو|ما\\s+(?:نقدر|اقدر|أقدر)|مقدرش|ماقدرش|مش\\s+هقدر|لا\\s+(?:نقدر|نتقابل)|اتلغى|اتلغت|ألغي|الغي|إلغاء|اتأجل|تأجل',
    'pas|jamais|annul\\p{L}*|report\\p{L}*|impossible',
    'iptal\\p{L}*|ertele\\p{L}*|olmaz|gelemem|buluşmayalım|görüşmeyelim|müsait değil\\p{L}*',
  ].join('|'),
);

/** An amount asked for: send me, pay me, you owe me. */
const PAY_ASK = words(
  [
    'send me|pay me|transfer me|venmo me|you owe me|owe me|pay (?:me )?back|(?:can|could|would) you (?:please )?(?:send|pay|transfer)|please (?:send|pay|transfer)',
    'حوّ?لّ?(?:ي|لي)|ابعتّ?(?:ي|لي)|ابعثلي|إبعتلي|ادفع(?:ي|لي)|إدفعلي|سدد(?:ي|لي)|رجّ?علي|رجّ?ع\\s+لي|ليّ?ا\\s+عندك|لي\\s+عندك|عليك\\s+(?:لي|ليا)',
    "envoie[- ]moi|envoyez[- ]moi|vire[- ]moi|virez[- ]moi|paie[- ]moi|paye[- ]moi|payez[- ]moi|rembourse[- ]moi|remboursez[- ]moi|tu me dois|vous me devez|tu peux me (?:virer|payer|rembourser)|tu peux m['’]envoyer",
    'bana\\s+(?:\\S+\\s+){0,3}(?:gönder|yolla|at|öde|havale et|transfer et)\\p{L}*|bana borçlusun|bana borcun|borcun var|öder misin|gönderir misin|yollar mısın|atar mısın',
  ].join('|'),
);

/** An amount offered: I'll send you, I'll pay you, I owe you. */
const PAY_SEND = words(
  [
    "i['’]?ll (?:send|pay|transfer|venmo) you|i will (?:send|pay|transfer) you|i owe you|i['’]?m sending you|let me (?:send|pay|transfer) you",
    'هحوّ?ل(?:ك|لك)|حاحوّ?لك|بحوّ?لك|رح\\s+حوّ?لك|راح\\s+أحوّ?لك|سأحوّ?ل\\p{L}*|هبعت(?:ك|لك)|هبعتلك|هدفع(?:ك|لك)|هسدد\\p{L}*|سأدفع\\p{L}*|عليّ?ا\\s+(?:لك|ليك)',
    "je t['’]envoie|je te (?:vire|paie|paye|rembourse|dois)|je vais te (?:payer|virer|rembourser|envoyer)",
    'sana\\s+(?:\\S+\\s+){0,3}(?:gönderirim|yollarım|atarım|öderim|havale ederim|gönderiyorum|yolluyorum|borçluyum)|sana borcum|ödeyeceğim|göndereceğim',
  ].join('|'),
);

const EN_DAY = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const AR_DAY =
  'اثنين|إثنين|اتنين|ثلاثاء|ثلاثا|تلات|اربعاء|أربعاء|اربع|أربع|خميس|جمعة|جمعه|سبت|احد|أحد|حد';
const FR_DAY = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const TR_DAY = 'pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cumartesi|cuma|pazar';

/**
 * How often a plan says it repeats (M17 I9c), most specific first; a weekday it names becomes
 * that one day in the words (`day`), so the date reader finds the first time ("every Monday at
 * 10" reads as "on Monday at 10"), and a phrase without a day leaves the rest of the words to say
 * when.
 */
const REPEAT_RULES: Array<{ re: RegExp; repeat: Repeat; day?: (m: RegExpExecArray) => string }> = [
  // Every workday.
  {
    re: words(
      [
        '(?:every|each)\\s+(?:work\\s?day|week\\s?day)|on\\s+weekdays|monday\\s+to\\s+friday',
        'كل\\s+يوم\\s+(?:عمل|شغل)|(?:في\\s+)?(?:أيام|ايام)\\s+(?:العمل|الشغل)',
        '(?:chaque|tous\\s+les)\\s+jours?\\s+ouvr[ée]s?|du\\s+lundi\\s+au\\s+vendredi',
        'her\\s+iş\\s+günü|hafta\\s+içi(?:\\s+her\\s+gün)?',
      ].join('|'),
    ),
    repeat: 'workday',
  },
  // Every other one of a day, then every two weeks.
  {
    re: words(`every\\s+other\\s+(${EN_DAY})|un\\s+(${FR_DAY})\\s+sur\\s+deux`),
    repeat: 'fortnight',
    day: (m) => (m[1] ? `on ${m[1]}` : (m[2] ?? '')),
  },
  {
    re: words(
      [
        'every\\s+(?:two|2)\\s+weeks|every\\s+other\\s+week|fortnightly|bi-?weekly',
        'كل\\s+(?:اسبوعين|أسبوعين|إسبوعين)',
        'toutes\\s+les\\s+deux\\s+semaines|une\\s+semaine\\s+sur\\s+deux|tous\\s+les\\s+quinze\\s+jours',
        '(?:her\\s+)?iki\\s+haftada\\s+bir|on\\s+beş\\s+günde\\s+bir',
      ].join('|'),
    ),
    repeat: 'fortnight',
  },
  // Every one of a day.
  {
    re: words(
      [
        `every\\s+(${EN_DAY})|on\\s+(${EN_DAY})s`,
        `كل\\s+(?:يوم\\s+)?(?:ال)?(${AR_DAY})`,
        `(?:chaque|tous\\s+les)\\s+(${FR_DAY})s?`,
        `her\\s+(${TR_DAY})(?:\\s+günü)?`,
      ].join('|'),
    ),
    repeat: 'week',
    day: (m) =>
      m[1] || m[2] ? `on ${m[1] ?? m[2]}` : m[3] ? `يوم ال${m[3]}` : (m[4] ?? m[5] ?? ''),
  },
  {
    re: words(
      [
        'every\\s+week|weekly|once\\s+a\\s+week',
        'كل\\s+(?:اسبوع|أسبوع|إسبوع)|(?:أسبوعي|اسبوعي)(?:ًا|ا)?|مرة\\s+في\\s+(?:الأسبوع|الاسبوع)',
        'chaque\\s+semaine|toutes\\s+les\\s+semaines|une\\s+fois\\s+par\\s+semaine|hebdomadaire(?:ment)?',
        'her\\s+hafta|haftada\\s+bir|haftalık',
      ].join('|'),
    ),
    repeat: 'week',
  },
  // Every month.
  {
    re: words(
      [
        'every\\s+month|monthly|once\\s+a\\s+month',
        'كل\\s+شهر|شهري(?:ًا|ا)?|مرة\\s+في\\s+الشهر',
        'chaque\\s+mois|tous\\s+les\\s+mois|une\\s+fois\\s+par\\s+mois|mensuel(?:le)?(?:ment)?',
        'her\\s+ay|ayda\\s+bir|aylık',
      ].join('|'),
    ),
    repeat: 'month',
  },
];

/** How often the words say a plan repeats, and the words with it said as one day, or null. */
export function repeatIn(text: string): { repeat: Repeat; said: string } | null {
  for (const rule of REPEAT_RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const day = rule.day ? rule.day(m) : '';
    return {
      repeat: rule.repeat,
      said: `${text.slice(0, m.index)} ${day} ${text.slice(m.index + m[0].length)}`
        .replace(/\s+/g, ' ')
        .trim(),
    };
  }
  return null;
}

/** What the words could be as a card, or null. */
export function cardOfferIn(
  text: string,
  options: WhenOptions & { currency?: string | null },
): CardOffer | null {
  const said = text.trim();
  if (said.length < 4) return null;
  const ask = PAY_ASK.test(said);
  if (ask || PAY_SEND.test(said)) {
    const amount = extractAmounts(said, { currency: options.currency ?? null })[0];
    if (amount && amount.value > 0) return { kind: 'pay', direction: ask ? 'ask' : 'send', amount };
  }
  if (MEET.test(said) && !MEET_NOT.test(said)) {
    // A plan that repeats starts at its first time (M17 I9c).
    const repeating = repeatIn(said);
    const when = firstFutureWhen(repeating?.said ?? said, options);
    if (when) return { kind: 'meeting', when, ...(repeating ? { repeat: repeating.repeat } : {}) };
  }
  return null;
}

/**
 * The card a sent message could be, as kept with its entities (M17 I9b): a meeting by its instant
 * (read on the sender's clock, so a reader elsewhere sees the same time), a Pay card by the way
 * the sender meant it and the amount.
 */
export type KeptCardOffer =
  | { kind: 'meeting'; at: string; hasTime: boolean; repeat?: Repeat }
  | { kind: 'pay'; direction: 'ask' | 'send'; value: number; currency: string | null };

export function keptCardOffer(offer: CardOffer | null): KeptCardOffer | null {
  if (!offer) return null;
  return offer.kind === 'meeting'
    ? {
        kind: 'meeting',
        at: offer.when.at,
        hasTime: Boolean(offer.when.time),
        ...(offer.repeat ? { repeat: offer.repeat } : {}),
      }
    : {
        kind: 'pay',
        direction: offer.direction,
        value: offer.amount.value,
        currency: offer.amount.currency,
      };
}
