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
import { firstFutureWhen, type WhenMatch, type WhenOptions } from './when';

export type CardOffer =
  | { kind: 'meeting'; when: WhenMatch }
  | { kind: 'pay'; direction: 'ask' | 'send'; amount: Amount };

const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const words = (list: string) => new RegExp(`${B}(?:${list})${E}`, 'iu');

/** A proposal to meet or talk, in the four languages, never one already past. */
const MEET = words(
  [
    // English: a proposal, an ask whether they're free, or a plan to set one up.
    "(?:let['’]?s|lets|shall we|can we|could we|should we|we could|wanna|want to)\\s+(?:\\w+\\s+){0,2}(?:meet|catch up|talk|call|chat|get together|have (?:a )?(?:call|chat|coffee|lunch|dinner)|grab (?:a )?(?:coffee|lunch|dinner|drink))",
    'meet (?:me|up)',
    'are you (?:free|around|available)',
    '(?:schedule|set up|book|arrange) (?:a )?(?:meeting|call)',
    // Arabic: we meet, talk, call, see each other, with any dialect's mark before it.
    '(?:خلينا|خلّينا|يلا|يلّا|تعال|ممكن)?\\s*(?:ه|ح|ب|راح\\s+|رح\\s+|منـ?)?(?:نتقابل|نتلاقى|نتلاقا|نلتقي|نلتقى|نتشاف|نشوف\\s+بعض|نجتمع|نتكلم|نتصل|نعمل\\s+مكالمة|نحكي|نقعد\\s+مع\\s+بعض|نشرب\\s+قهوة)',
    'نتقابلو|نتلاقاو|نشوفو\\s+بعض',
    '(?:انت|إنت|انتي|إنتي)?\\s*(?:فاضي|فاضية|متاح|متاحة|فاضيين)',
    // French.
    'on se (?:voit|retrouve|capte|parle|fait (?:un|une) (?:point|appel|visio|café|déj|dîner))',
    "on s['’]appelle",
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
    const when = firstFutureWhen(said, options);
    if (when) return { kind: 'meeting', when };
  }
  return null;
}

/**
 * The card a sent message could be, as kept with its entities (M17 I9b): a meeting by its instant
 * (read on the sender's clock, so a reader elsewhere sees the same time), a Pay card by the way
 * the sender meant it and the amount.
 */
export type KeptCardOffer =
  | { kind: 'meeting'; at: string; hasTime: boolean }
  | { kind: 'pay'; direction: 'ask' | 'send'; value: number; currency: string | null };

export function keptCardOffer(offer: CardOffer | null): KeptCardOffer | null {
  if (!offer) return null;
  return offer.kind === 'meeting'
    ? { kind: 'meeting', at: offer.when.at, hasTime: Boolean(offer.when.time) }
    : {
        kind: 'pay',
        direction: offer.direction,
        value: offer.amount.value,
        currency: offer.amount.currency,
      };
}
