/**
 * Which language a sentence in Latin letters is written in, for the message intelligence: French
 * or Turkish only when the sentence says so clearly, English otherwise. A sentence is short, so
 * this counts the words each language can't do without ("je", "vous", "lütfen", "mısın"), its
 * own letters (ğ ş ı, é è à) and its endings, against English's own small words. An English
 * sentence that names "Ayşe" or a "café" stays English; a tie stays English. Pure, so every
 * device reads a message the same way.
 */

export type LatinLanguage = 'en' | 'fr' | 'tr';

/** English's small words. "a", "on", "me", "her", "en", "et", "ne", "de" are left out: other languages share them. */
const EN_WORDS = new Set(
  (
    "i i'll i'm i've i'd im you you're you'll your yours u ur we we'll we're we've our they " +
    "they're their them he she him his it it's its the an and or but to of for with at in by from " +
    'about into is are was were be been being am will would can could should shall may might must ' +
    "do does did don't can't won't didn't doesn't isn't aren't wasn't have has had haven't my us " +
    'this that these those there here what when where who why how which please pls plz thanks ' +
    'thank thx yes yeah yep no not just so if then than all any some up out get got need want ' +
    "know see go going gonna let let's lets send call check today tomorrow tonight morning " +
    'evening week next last time meeting sure great good sounds done sorry hi hey hello back ' +
    'after before soon later also too very really now still again one new free'
  ).split(' '),
);

const FR_WORDS = new Set(
  (
    'je tu vous nous il ils elle elles le la les des du au aux est sont suis es êtes sommes ai ' +
    'as avons avez ont pas pour que qui quoi avec une un ce cet cette ces mais très ou où ça sur ' +
    "dans merci bonjour bonsoir salut coucou oui ouais non demain aujourd'hui hier soir matin midi " +
    'semaine mois prochain prochaine dernier dernière mon ma mes ta tes sa ses votre vos notre nos ' +
    'moi toi lui leur leurs te se si peux peut pouvez pourrais pourriez veux voulez vais va vas ' +
    'allons allez fait faire fais faites bien aussi déjà encore toujours rien tout tous toute alors ' +
    'donc bon voilà chez quand comment pourquoi combien quel quelle quels quelles stp svp plaît ' +
    "d'accord parfait entendu rdv dispo envoie envoyez appelle appelez rappelle rappelez confirme " +
    'confirmez vérifie vérifiez signe signez paie payez réserve réservez prépare préparez ' +
    "transfère transférez facture devis virement colis livraison réunion jusqu'à jusqu'au " +
    'nickel impec rendez'
  ).split(' '),
);

const TR_WORDS = new Set(
  (
    've bir bu şu da mi mı mu mü için ile çok ama ben sen biz siz var yok evet hayır tamam ' +
    'tamamdır lütfen teşekkürler teşekkür sağol sağ gibi daha sonra kadar önce şimdi hemen ' +
    'merhaba selam abi abla hocam kanka canım peki olur oldu harika süper uyar yarın bugün dün ' +
    'akşam sabah öğlen saat gün hafta haftaya gelecek geçen belki karar rica değil nasıl neden ' +
    'niye nerede nerde kaç hangi zaman beni bana sana seni bize size onu ona bunu şunu dosya ' +
    'dosyayı kargo fatura faturayı ödeme toplantı randevu görüşme kahve fiyat havale iade ' +
    'kapora dekont teslim takip yolda gönder yolla ara öde onayla imzala kontrol misin mısın ' +
    'musun müsün misiniz mısınız yarin bugun simdi lutfen tesekkurler cok icin degil nasil kac ' +
    'odeme toplanti gorusme anlaştık milyon milyar'
  ).split(' '),
);

/** Turkish endings: the future (-ecek, -acağım, -icem), the progressive (-iyor), "can you" (-ebilir), "are you" (-mısın). */
const TR_ENDING =
  /(?:[iıuü]yor(?:um|sun|uz|sunuz|lar|du[mk]?)?|[ae]c[ae]k(?:t[ıi]m?|lar)?|[ae]ce[ğg]i[mz]|[ae]ca[ğg][ıi][mz]|[ıiuü]c[ae][mz]|[ae]c[ae][mz]|[ae]bil[ıi]r|m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?)$/u;
/** A Turkish case ending after an apostrophe: "Ahmet'e", "Mart'ta", "3'te", "TL'yi". */
const TR_APOSTROPHE =
  /^[\p{L}\p{N}]+'(?:[ae]|y?[ıiuü]|[dt][ae]n?|n[ıiuü]n|y[ae]|l[ae]|y?l[ae]|s[ıiuü])$/u;
/** French elision: j'ai, l'option, c'est, qu'on, s'il. */
const FR_ELISION = /^(?:j|l|d|c|n|m|t|s|qu|jusqu|lorsqu|puisqu)'\p{L}/u;
const TR_LETTERS = /[ğşıöü]/u;
/** Turkish nouns with their endings: "kargoya", "faturayı", "toplantıda". */
const TR_STEMS =
  /^(?:kargo|fatura|ödeme|toplant|randevu|sipariş|teslim|havale|dosya|sözleşme|teklif|rapor|kapora)/u;
const FR_LETTERS = /[éèêàùœâîûëï]/u;
/** French words English writes too: they don't make a sentence French. */
const LOANWORDS = new Set(
  'café cafés résumé résumés fiancé fiancée naïve cliché déjà entrée rosé soirée décor façade crème brûlée touché exposé passé protégé sauté purée éclair attaché señor fête rôle'.split(
    ' ',
  ),
);

export interface LanguageScores {
  en: number;
  fr: number;
  tr: number;
}

/** What each language scores in the text: one point a word, for the first sign it shows. */
export function latinScores(text: string): LanguageScores {
  const scores: LanguageScores = { en: 0, fr: 0, tr: 0 };
  const tokens = text.replace(/’/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
  for (const raw of tokens) {
    // An acronym ("EST", "TL", "OK") says nothing about the sentence around it.
    if (raw.length >= 2 && raw === raw.toUpperCase() && /\p{Lu}/u.test(raw)) continue;
    if (!/\p{L}/u.test(raw.replace(/'.*$/, '')) && !TR_APOSTROPHE.test(raw)) continue;
    // "İ" lowercases to two characters in JavaScript; Turkish's own lowercase is one.
    const t = raw.replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase();
    if (EN_WORDS.has(t)) scores.en += 1;
    else if (TR_WORDS.has(t)) scores.tr += 1;
    else if (FR_WORDS.has(t)) scores.fr += 1;
    else if (FR_ELISION.test(t)) scores.fr += 1;
    else if (TR_APOSTROPHE.test(t)) scores.tr += 1;
    else if (/[ğşı]/u.test(t) || /İ/.test(raw) || TR_ENDING.test(t) || TR_STEMS.test(t))
      scores.tr += 1;
    else if (FR_LETTERS.test(t) && !LOANWORDS.has(t)) scores.fr += 1;
    else if (TR_LETTERS.test(t)) scores.tr += 1;
  }
  return scores;
}

/** The sentence's language: French or Turkish when it scores above English and the other. */
export function latinLanguage(text: string): LatinLanguage {
  const s = latinScores(text);
  if (s.fr > s.en && s.fr > s.tr) return 'fr';
  if (s.tr > s.en && s.tr > s.fr) return 'tr';
  return 'en';
}
