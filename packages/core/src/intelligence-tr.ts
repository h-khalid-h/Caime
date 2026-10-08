/**
 * Turkish as people text it (R59). The verb comes last and carries the person, so a promise or
 * an ask is read off its ending ("göndereceğim", "gönderirim", "gönderebilir misin", "gönder")
 * and the thing is the words before it ("Yarın sözleşmeyi göndereceğim": "sözleşmeyi"). A
 * negation lives inside the verb ("göndermeyeceğim"), so it never reads as the promise. Questions
 * are the "mı" particle or a question word; decisions "karar verdik", "anlaştık", "… ile devam
 * ediyoruz". Titles are the person's own words, the dates taken out.
 */
import type { ActionClause } from './intelligence';
import {
  dateOfClause,
  removeRanges,
  type SentenceContext,
  type SentenceReading,
} from './intelligence-shared';

const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const re = (source: string, flags = 'u') => new RegExp(source, flags);

/** Lowercase as Turkish does ("I" is "ı", "İ" is "i"), the same length as the sentence. */
function fold(s: string): string {
  return s.replace(/’/g, "'").replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

/** "İkinci", not "Ikinci". */
function capitalise(s: string): string {
  const c = s.charAt(0);
  return (c === 'i' ? 'İ' : c === 'ı' ? 'I' : c.toUpperCase()) + s.slice(1);
}

const VOWELS = /[aeıioöuü]/gu;

// ---------------------------------------------------------------------------------------------
// Verbs

/** First person future, as written and as texted: göndereceğim, göndereceğiz, göndericem, yapacam. */
const FUTURE_MINE = /(?:[ae]c[ae][ğg][ıi][mz]|[ıiuü]y?c[ae][mz]|[ae]c[ae][mz])$/u;
/** The same with its negation inside: göndermeyeceğim, göndermicem. */
const FUTURE_NOT = /(?:m[ae]y[ae]c[ae][ğg][ıi][mz]|m[ıi]y?c[ae][mz]|m[ae]y[ae]c[ae][mz])$/u;
const FUTURE_ENDING = /y?(?:[ae]c[ae][ğg][ıi][mz]|[ıiuü]y?c[ae][mz]|[ae]c[ae][mz])$/u;
/** "Olacağım", "deneyeceğim", "göreceğiz": no promise to do anything. */
const NOT_PROMISED = new Set(
  'ol dene düşün gör bil kal çalış iste san sev öl inan anla'.split(' '),
);
/** The present tense as a promise, for the verbs that promise: "ararım", "hallederim". */
const AORIST_PROMISE = new Set(
  (
    'ararım ararız gönderirim göndeririz yollarım yollarız hallederim hallederiz bakarım ' +
    'dönerim döneriz öderim öderiz onaylarım onaylarız atarım atarız iletirim iletiriz ' +
    'paylaşırım paylaşırız hazırlarım hazırlarız ilgilenirim ilgileniriz getiririm getiririz ' +
    'yazarım yazarız söylerim söyleriz bildiririm bildiririz aktarırım aktarırız ayarlarım ' +
    'ayarlarız imzalarım imzalarız veririm veririz sorarım sorarız ararim gonderirim ' +
    'uğrarım uğrarız düzeltirim düzeltiriz anlatırım anlatırız gösteririm gösteririz ' +
    'yollarim bakarim donerim oderim onaylarim atarim iletirim ugrarim'
  ).split(' '),
);
/** How often, before a present tense: then it's a habit ("ara sıra uğrarım"), not a promise. */
const HABITUAL = re(
  `${B}(?:ara\\s+sıra|arada\\s+bir|bazen|genelde|genellikle|hep|daima|sık\\s+sık|çoğu\\s+zaman|her\\s+(?:gün|hafta|ay|sabah|akşam|zaman|seferinde))${E}`,
);
/** Nouns that make a verb with "et" or "ver": "kontrol ederim", "haber veririm". */
const COMPOUND_NOUNS = new Set(
  'kontrol rezerve teyit iptal havale transfer teslim takip organize haber bilgi dönüş geri'.split(
    ' ',
  ),
);
/** A reported promise ("göndereceğim dedi") is someone else's. */
const REPORTED = /^(?:dedi|diyor|demişti|demiş|dedin|diye|dediği|dedim|demiştim|demişsin)$/u;
const PARTICLE =
  /^m[ıiuü](?:s[ıiuü]n(?:[ıiuü]z)?|y[ıiuü]z|yd[ıiuü](?:m|n|k|n[ıiuü]z)?|d[ıiuü]r|y[ıiuü]m)?$/u;
const PARTICLE_YOU = /^m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?$/u;

/** The verbs a command may be, and their forms: "gönder", "gönderin", "gönderiniz", "göndersene". */
const COMMAND_STEMS = 'gönder yolla ara onayla imzala öde ayır ayırt at ilet paylaş hazırla getir';
/** Commands said last only (or with "lütfen"): too common a word to open a sentence with. */
const LATE_COMMAND_STEMS =
  'söyle bildir dön yaz düzelt güncelle yükle ayarla hallet sor incele bekle hatırlat aktar ekle sil kaydet doldur';
const HANDOVER_STEMS = new Set('gönder yolla ilet paylaş at aktar ver getir'.split(' '));

function harmony(stem: string): { high: string; back: boolean } {
  const vowels = stem.match(VOWELS) ?? ['e'];
  const v = vowels[vowels.length - 1]!;
  const high = /[aı]/.test(v) ? 'ı' : /[ei]/.test(v) ? 'i' : /[ou]/.test(v) ? 'u' : 'ü';
  return { high, back: /[aıou]/.test(v) };
}

function commandForms(stems: string, into: Map<string, string>) {
  for (const stem of stems.split(' ')) {
    const { high, back } = harmony(stem);
    const buffer = /[aeıioöuü]$/.test(stem) ? 'y' : '';
    into.set(stem, stem);
    into.set(`${stem}${buffer}${high}n`, stem);
    into.set(`${stem}${buffer}${high}n${high}z`, stem);
    into.set(`${stem}${back ? 'sana' : 'sene'}`, stem);
    into.set(`${stem}${back ? 'sanıza' : 'senize'}`, stem);
  }
}
const COMMANDS = new Map<string, string>();
commandForms(COMMAND_STEMS, COMMANDS);
const LATE_COMMANDS = new Map<string, string>(COMMANDS);
commandForms(LATE_COMMAND_STEMS, LATE_COMMANDS);
for (const [form, stem] of [
  ['et', 'et'],
  ['edin', 'et'],
  ['ediniz', 'et'],
  ['etsene', 'et'],
  ['etsenize', 'et'],
  ['ver', 'ver'],
  ['verin', 'ver'],
  ['veriniz', 'ver'],
  ['versene', 'ver'],
] as const)
  LATE_COMMANDS.set(form, stem);
/** "Bir ara", "bu ara", "o ara": a while, not "call". */
const NOT_A_COMMAND_BEFORE = /^(?:bir|bu|o|şu)$/u;

/** The present tense's stem: "gönderir" → "gönder", "yollar" → "yolla", "atar" → "at". */
const AORIST_STEMS: Record<string, string> = {
  arar: 'ara',
  öder: 'öde',
  eder: 'et',
  halleder: 'hallet',
  gider: 'git',
  der: 'de',
  yer: 'ye',
  okur: 'oku',
  alır: 'al',
  verir: 'ver',
  gelir: 'gel',
  bulur: 'bul',
  olur: 'ol',
  atar: 'at',
  bakar: 'bak',
  yapar: 'yap',
  yazar: 'yaz',
  satar: 'sat',
  tutar: 'tut',
  döner: 'dön',
  açar: 'aç',
  keser: 'kes',
  seçer: 'seç',
  çeker: 'çek',
  koyar: 'koy',
  sorar: 'sor',
  siler: 'sil',
};
/** Polysyllabic stems end in a vowel before "-r" ("yolla-r"); the short ones are listed above. */
function aoristStem(word: string): string {
  const known = AORIST_STEMS[word];
  if (known) return known;
  return /[ıiuü]r$/u.test(word) ? word.slice(0, -2) : word.slice(0, -1);
}
/** A stem as it's said alone: "ed" is "et", "gid" is "git". */
function asSaid(stem: string): string {
  return stem === 'ed' ? 'et' : stem === 'gid' ? 'git' : stem;
}
/** "İnanabilir misin", "ister misin", "içer misin": a wonder or an offer, not an ask. */
const NOT_ASKED = new Set(
  'inan bil iste sev düşün iç ye kız anla gör duy beğen hatırla tanı ol'.split(' '),
);

// ---------------------------------------------------------------------------------------------
// Words around the verb

/** What sits before a verb without being the thing: who it's for, when, how soon. */
const NOT_THE_THING = new Set(
  (
    'sana size sizlere ona onlara bana bize beni bizi seni sizi ben biz sen siz de da hemen ' +
    'şimdi birazdan mutlaka ' +
    'kesin kesinlikle tekrar yine akşam sabah öğlen gece saat sonra önce ilk ayrıca hadi haydi ' +
    'lütfen rica etsem bir zahmet acil acilen zaten artık hemencecik en kısa sürede ' +
    'canım abi abla hocam kanka ya bakalım tamam peki'
  ).split(' '),
);
const POINTING = /^(?:bunu|şunu|onu|bunları|şunları|onları|bunu da|onu da|hepsini)$/u;
const TRAILING_SOFTENERS =
  /(?:\s+(?:lütfen|rica\s+etsem|bir\s+zahmet|ya|artık|bakalım|hadi|haydi|canım|abi|abla|hocam|kanka|teşekkürler|sağ\s*ol|tamam\s+mı))+[\s.!?,;:…]*$/iu;
const LEADING_SOFTENERS =
  /^(?:(?:tamam|peki|hadi|haydi|lütfen|o\s+zaman|şimdi|rica\s+etsem|bir\s+zahmet|merhaba|selam|evet|abi|abla|hocam|kanka)[\s,!.]+)+/iu;
const COURTESY =
  /(?<![\p{L}])(?:lütfen|rica\s+etsem|bir\s+zahmet|zahmet\s+olmazsa)(?![\p{L}])\s*/giu;
const CLAUSE_BREAK = /[,;:]|(?<![\p{L}])(?:ama|fakat|ancak|çünkü|yoksa)(?![\p{L}])/gu;
const FIRST_BREAK = new RegExp(CLAUSE_BREAK.source, 'u');

function tidy(s: string): string {
  let out = s.replace(/’/g, "'").replace(/\s+/g, ' ');
  for (let i = 0; i < 2; i++)
    out = out
      .replace(/[.!?,;:…]+$/u, '')
      .replace(TRAILING_SOFTENERS, '')
      .trim();
  return out;
}

interface Word {
  /** As folded. */
  w: string;
  start: number;
  end: number;
}

function wordsOf(f: string): Word[] {
  return [...f.matchAll(/[\p{L}\p{N}][\p{L}\p{N}']*/gu)].map((m) => ({
    w: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** Where the clause holding `at` begins: after the last comma or "ama" before it. */
function clauseStart(f: string, at: number): number {
  let from = 0;
  for (const b of f.slice(0, at).matchAll(CLAUSE_BREAK)) from = b.index + b[0].length;
  return from;
}

/** Where the clause that goes on from `from` ends. */
function clauseEnd(f: string, from: number): number {
  const m = FIRST_BREAK.exec(f.slice(from));
  return m ? from + m.index : f.length;
}

/** The words of the sentence between two points, as written, dates taken out. */
function written(ctx: SentenceContext, from: number, to: number): string {
  return tidy(removeRanges(ctx.text.slice(from, to), ctx.index + from, ctx.dates));
}

/** "Bana", "bize": who it's for, never the thing or the task. */
const TO_ME = /(?<![\p{L}])(?:bana|bize)(?![\p{L}])/giu;
/** A time said with the verb ("toplantıdan sonra", "en kısa sürede"): when, not what. */
const WHEN_WORDS =
  /(?<![\p{L}])(?:\p{L}+(?:dan|den|tan|ten)\s+(?:sonra|önce|itibaren)|en\s+kısa\s+sürede|bir\s+an\s+önce|ilk\s+fırsatta|mutlaka|kesinlikle)(?![\p{L}])\s*/giu;
/** Who says it and when, at the start of a promise: "Ben hallederim" is "Hallederim". */
const LEAD_WORDS =
  /^(?:(?:ben|biz)(?:\s+de|\s+da)?|akşam|sabah|öğlen|gece|hemen|şimdi|birazdan|zaten|ayrıca|tekrar|yine)\s+/iu;

function plainTitle(title: string): string {
  let out = title.replace(WHEN_WORDS, '').trim();
  for (let i = 0; i < 3; i++) out = out.replace(LEAD_WORDS, '');
  return out.trim() || title;
}

/** The thing in the words before a verb: "Sana sözleşmeyi" → "Sözleşmeyi". */
function thingOf(said: string): string | null {
  const before = said.replace(WHEN_WORDS, '').trim();
  const words = fold(before).split(/\s+/).filter(Boolean);
  const kept = before.split(/\s+/).filter(Boolean);
  let a = 0;
  let b = words.length;
  while (a < b && NOT_THE_THING.has(words[a]!)) a++;
  while (b > a && (NOT_THE_THING.has(words[b - 1]!) || COMPOUND_NOUNS.has(words[b - 1]!))) b--;
  const thing = kept
    .slice(a, b)
    .join(' ')
    .replace(/[.!?,;:]+$/u, '');
  if (!thing || POINTING.test(fold(thing))) return null;
  return capitalise(thing);
}

function action(
  ctx: SentenceContext,
  title: string,
  before: string,
  stem: string,
  at: number,
): ActionClause | null {
  if (!title) return null;
  return {
    title: capitalise(title),
    object: thingOf(before),
    handover: HANDOVER_STEMS.has(stem),
    when: dateOfClause(ctx, CLAUSE_BREAK, at),
    quote: ctx.said,
  };
}

// ---------------------------------------------------------------------------------------------
// Vocabulary

const QUESTION_WORD = re(
  `${B}(?:ne\\s+zaman|nerede|nerde|nereye|nereden|neresi|kim(?:e|i|in|den)?|nasıl|neden|niye|niçin|kaç(?:ta|a|ıncı)?|hangi(?:si)?|ne\\s+kadar|ne|neler|neyi|neyin)${E}`,
);
/** Said with a question word and no question in it: "ne güzel", "kim bilir", "nasıl istersen". */
const NOT_A_QUESTION = re(
  `${B}(?:bilmiyorum|bilmem|emin\\s+değilim|hatırlamıyorum|fark\\s+etmez)${E}|${B}(?:ne\\s+(?:güzel|hoş|iyi|harika|şans|yazık|de\\s+olsa)|kim\\s+bilir|neden\\s+olmasın|niye\\s+olmasın|ne\\s+kadar\\s+(?:güzel|iyi|harika|tatlı|zor|kolay|çok|uzun|hoş)|ne\\s+olursa\\s+olsun|hangisi\\s+olursa)${E}|${B}(?:ne\\s+zaman|nasıl|nereye|nerede|ne|hangi|kim)\\s+(?:\\p{L}+\\s+)?\\p{L}+(?:s[ae]n?(?:[ıi]z)?|rs[ae])${E}`,
);

/** "Nasılsın", "naber": asked without a question word on its own. */
const HOW_ARE_YOU =
  /^(?:nasılsın(?:ız)?|naber|n'aber|ne\s+haber|napıyorsun|ne\s+yapıyorsun|iyi\s+misin(?:iz)?)[\s,!.]*(?:\p{L}+)?$/u;

const DECISION = re(
  `${B}(karar(?:ımızı|ımı)?\\s+(?:verdik|verildi|verdim|kıldık|aldık|alındı)|kabul\\s+(?:edildi|ettik|ediyoruz)|anlaştık|onaylandı|onayladık|onayladım|onaylıyorum|onaylıyoruz|kesinleşti|kesinleştirdik|kesinleştirildi|seçtik|seçildi|tercih\\s+ettik|devam\\s+(?:ediyoruz|edeceğiz|edelim)|ilerliyoruz|ilerleyeceğiz|ilerleyelim|gidiyoruz|gidelim|gideceğiz)${E}`,
);
/** "Devam ediyoruz" decides only with what it goes on with: "ikinci teklifle", "B planı ile". */
const GOES_WITH = /(?:\s+ile|y?l[ae])\s+$/u;
const NOT_DECIDED = re(
  `${B}(?:henüz|belki|eğer|şayet|umarım|inşallah|sanırım|galiba|değil|hala|hâlâ)${E}[^.!?]{0,30}$`,
);
const FILLER_START =
  /^(?:(?:tamam(?:dır)?|peki|o\s+zaman|evet|süper|harika|hadi|haydi|neyse|yani|ok|okey|oldu|güzel)(?:[\s,!.:]+|$))+/u;

const CONFIRM = re(
  `^(?:(?:tamam(?:dır)?|olur|anlaştık|peki|evet|süper|harika|uyar|oldu|tabii|tabi|elbette|kesinlikle|aynen|okey|ok|baş\\s+üstüne|memnuniyetle|olur\\s+tabii|👍|✅)[\\s.!,]*)+(?:(?:teşekkürler|teşekkür\\s+ederim|sağ\\s*ol(?:un)?)[\\s.!]*)?$`,
);

export const TR_PAY = re(
  `${B}(?:öde(?!v)\\p{L}*|fatura\\p{L}*|havale\\p{L}*|eft|iade\\p{L}*|kapora\\p{L}*|depozito\\p{L}*|fiyat\\p{L}*|dekont\\p{L}*|borç\\p{L}*|taksit\\p{L}*|ücret\\p{L}*|para(?:yı|nı|n|lar\\p{L}*)?)${E}`,
  'iu',
);
export const TR_PAID = re(
  `${B}(?:ödedim|ödedik|ödendi|ödeme\\p{L}*|fatura\\p{L}*|havale\\p{L}*|eft|iade\\p{L}*|dekont\\p{L}*)${E}`,
  'iu',
);
export const TR_PLAN = re(
  `${B}(?:toplantı\\p{L}*|randevu\\p{L}*|görüşme\\p{L}*|görüşelim|öğle\\s+yemeği\\p{L}*|akşam\\s+yemeği\\p{L}*|kahve\\p{L}*|buluşalım|buluşma\\p{L}*|müsait\\p{L}*|toplanalım|konuşalım|ziyaret\\p{L}*)${E}`,
  'iu',
);
export const TR_TRACK = re(
  `${B}(?:kargo\\p{L}*|teslim\\s+edildi|takip\\s+numarası|takip\\s+no|yolda|gönderildi|kurye\\p{L}*|sipariş\\s+durumu|dağıtımda)${E}`,
  'iu',
);

// ---------------------------------------------------------------------------------------------

function readCommitment(ctx: SentenceContext, f: string, words: Word[]): ActionClause | null {
  for (let i = 0; i < words.length; i++) {
    const { w, start, end } = words[i]!;
    const next = words[i + 1]?.w ?? '';
    let stem: string | null = null;
    if (FUTURE_MINE.test(w) && !FUTURE_NOT.test(w)) {
      stem = w.replace(FUTURE_ENDING, '');
      if (NOT_PROMISED.has(stem) || stem.length < 2) continue;
    } else if (AORIST_PROMISE.has(w)) {
      // "Ara sıra uğrarım", "her gün ararım": what's done now and then, not promised.
      if (HABITUAL.test(f.slice(clauseStart(f, start), start))) continue;
      stem = aoristStem(w.replace(/[ıi][mz]$/u, ''));
    } else if (/^(?:eder|yapar)[ıi][mz]$/u.test(w) && COMPOUND_NOUNS.has(words[i - 1]?.w ?? ''))
      stem = w.startsWith('y') ? 'yap' : 'et';
    else if (/[ae]c[ae][ğg][ıi]m[ae]$/u.test(w) && next === 'söz') {
      // "Getireceğime söz veriyorum": the promise is "getireceğim".
      const from = clauseStart(f, start);
      const before = written(ctx, from, start);
      const verb = ctx.text.slice(start, end - 1);
      return action(
        ctx,
        before ? `${before} ${verb}` : verb,
        before,
        w.replace(/y?[ae]c[ae][ğg][ıi]m[ae]$/u, ''),
        start,
      );
    }
    if (!stem) continue;
    // "Göndereceğim mi?" asks; "göndereceğim dedi" reports.
    if (PARTICLE.test(next) || REPORTED.test(next)) continue;
    const from = clauseStart(f, start);
    const title = plainTitle(written(ctx, from, clauseEnd(f, end)));
    const before = written(ctx, from, start);
    return action(ctx, title, before, stem, start);
  }
  return null;
}

/** The verb's stem when the word asks the reader to do it: "gönderebilir misin", "atar mısın". */
function askedStem(w: string, next: string): string | null {
  const fused = /^(.+?)(m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?)$/u.exec(w);
  const [verb, particle] =
    fused && /(?:bil[ıi]r|[aeıiuü]r)$/u.test(fused[1]!) ? [fused[1]!, fused[2]!] : [w, next];
  if (!PARTICLE_YOU.test(particle)) return null;
  if (/y?[ae]bil[ıi]r$/u.test(verb)) return asSaid(verb.replace(/y?[ae]bil[ıi]r$/u, ''));
  // "Göndermez misin" is a reproach, not an ask.
  if (/[aeıiuü]r$/u.test(verb) && !/m[ae]z$/u.test(verb)) return asSaid(aoristStem(verb));
  return null;
}

function readRequest(
  ctx: SentenceContext,
  f: string,
  words: Word[],
  asked: boolean,
): ActionClause | null {
  for (let i = 0; i < words.length; i++) {
    const { w, start } = words[i]!;
    const next = words[i + 1]?.w ?? '';
    // What's asked for is said before the verb: "Bana sözleşmeyi | gönderebilir misin".
    const lead = written(ctx, clauseStart(f, start), start).replace(LEADING_SOFTENERS, '');
    const titled = (stem: string) => {
      const said = lead.replace(COURTESY, '').replace(TO_ME, ' ').trim();
      return action(ctx, said ? `${said} ${stem}` : stem, lead, stem, start);
    };

    // "Gönderebilir misin", "atar mısın", "kontrol eder misiniz"
    // "Bakar mısın?" alone calls a waiter; "şuna bakar mısın" asks for a look.
    const stem = askedStem(w, next);
    if (stem && !NOT_ASKED.has(stem) && (stem !== 'bak' || lead)) return titled(stem);
    // "Getirmeyi unutma": don't forget to bring
    if (/^unutma(?:y[ıi]n(?:[ıi]z)?)?$/u.test(w)) {
      const prev = words[i - 1];
      if (prev && /m[ae]y[ıi]$/u.test(prev.w)) {
        const lead2 = written(ctx, clauseStart(f, prev.start), prev.start)
          .replace(LEADING_SOFTENERS, '')
          .replace(COURTESY, '');
        const s = asSaid(prev.w.replace(/m[ae]y[ıi]$/u, ''));
        return action(ctx, lead2 ? `${lead2} ${s}` : s, lead2, s, prev.start);
      }
    }
    // "Göndermen lazım", "göndermenizi rica ederim"
    const must = /^(.+?)m[ae]n(?:[ıi]z)?$/u.exec(w);
    const mustStem = must ? LATE_COMMANDS.get(must[1]!) : undefined;
    if (mustStem && /^(?:lazım|gerek|gerekiyor|gerekli)$/u.test(next)) return titled(mustStem);
    const please = /^(.+?)m[ae](?:n[ıi]z[ıi]|n[ıi])$/u.exec(w);
    if (
      please &&
      next === 'rica' &&
      /^(?:ederim|ediyorum|ederiz|ediyoruz)$/u.test(words[i + 2]?.w ?? '')
    )
      return titled(asSaid(please[1]!));
  }

  if (asked) return null;
  const text = tidy(removeRanges(ctx.text, ctx.index, ctx.dates))
    .replace(LEADING_SOFTENERS, '')
    .replace(COURTESY, '')
    .trim();
  const said = fold(text).split(/\s+/).filter(Boolean);
  // A command last in its clause: "Faturayı gönder", "Beni ara", with "lütfen" any polite form.
  const last = said[said.length - 1] ?? '';
  const politely = new RegExp(COURTESY.source, 'iu').test(f);
  const lastStem =
    LATE_COMMANDS.get(last) ??
    (politely && last.length >= 5 && /(?:y?[ıiuü]n(?:[ıiuü]z)?|s[ae]n[ae])$/u.test(last)
      ? last
      : undefined);
  if (lastStem && said.length > 1 && !(said.length === 2 && NOT_A_COMMAND_BEFORE.test(said[0]!))) {
    const title = text.replace(TO_ME, ' ').replace(/\s+/g, ' ').trim();
    const compound = /^(?:et|edin|ediniz|etsene|etsenize|ver|verin|veriniz|versene)$/u.test(last);
    const before = title
      .split(/\s+/)
      .slice(0, compound ? -2 : -1)
      .join(' ');
    return action(ctx, title, before, lastStem, 0);
  }
  // A command first: "Gönder bakalım", "Ara beni". Never "ara sıra" or "ara ver".
  const firstStem = COMMANDS.get(said[0] ?? '');
  if (
    firstStem &&
    firstStem !== 'at' &&
    said.length > 1 &&
    !/^(?:sıra|sıcak|ver\p{L}*|da|de)$/u.test(said[1]!)
  )
    return action(ctx, text, text.split(/\s+/).slice(1).join(' '), firstStem, 0);
  return null;
}

function readDecision(ctx: SentenceContext, f: string): SentenceReading['decision'] {
  const d = DECISION.exec(f);
  if (!d) return null;
  const before = f.slice(0, d.index);
  if (/^(?:devam|ilerl|gid)/u.test(d[1]!) && !GOES_WITH.test(before)) return null;
  if (NOT_DECIDED.test(before)) return null;
  // A question after it ("anlaştık mı") is no decision.
  if (/^\s*m[ıiuü](?![\p{L}])/u.test(f.slice(d.index + d[0].length))) return null;
  const said = tidy(ctx.text);
  const rest = tidy(ctx.text.slice(d.index + d[0].length)).replace(/^[\s:,-]+/u, '');
  // "Karar verdik: B planı" is "B planı"; otherwise the sentence, its opening words aside.
  const title =
    rest && /^karar/u.test(d[1]!) && !fold(before).replace(FILLER_START, '').trim()
      ? rest
      : said.slice(fold(said).length - fold(said).replace(FILLER_START, '').length);
  return { title: capitalise(tidy(title)), quote: ctx.said };
}

/** One Turkish sentence: whether it asks, confirms, decides, promises or asks for something. */
export function readTurkish(ctx: SentenceContext): SentenceReading {
  const f = fold(ctx.text);
  const words = wordsOf(f);
  const endsWithQuestion = /[?؟]\s*$/u.test(ctx.text);
  const lastWord = words[words.length - 1]?.w ?? '';
  // The particle as its own word ("geldin mi"), or run into the verb ("gönderirmisin").
  const particle =
    words.some((x) => PARTICLE.test(x.w)) || /[rl]m[ıiuü]s[ıiuü]n(?:[ıiuü]z)?$/u.test(lastWord);
  const asks =
    endsWithQuestion ||
    ((particle || (QUESTION_WORD.test(f) && !NOT_A_QUESTION.test(f))) &&
      ctx.text.length < 160 &&
      !/[.!]$/.test(ctx.text));
  return {
    asks: asks || HOW_ARE_YOU.test(f.trim()),
    confirms: CONFIRM.test(f.trim()),
    decision: asks ? null : readDecision(ctx, f),
    commitment: readCommitment(ctx, f, words),
    request: readRequest(ctx, f, words, asks),
  };
}
