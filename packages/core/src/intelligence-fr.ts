/**
 * French as people text it (R55: France, the Maghreb, Lebanon): promises ("je vais t'envoyer",
 * "j'enverrai", "je m'en occupe"), asks ("tu peux", "merci de", "envoie-moi"), decisions ("on
 * part sur", "c'est validé"), questions without their mark ("est-ce que", "peux-tu") and the
 * words of money, plans and parcels. Lists, as for Arabic: a trigger is a whole word, a negation
 * beside it takes it back, and a suggestion's title is the person's own words with the verb as
 * an infinitive ("Envoyer le contrat"), which the French interface reads as "Sam va envoyer le
 * contrat".
 */
import type { ActionClause } from './intelligence';
import {
  dateOfClause,
  removeRanges,
  type SentenceContext,
  type SentenceReading,
} from './intelligence-shared';

/** A word's edges: \b stops at "é". */
const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const re = (source: string, flags = 'u') => new RegExp(source, flags);

/** Lowercase with ’ as ', the same length as the sentence, so an index points into both. */
function fold(s: string): string {
  return s.replace(/’/g, "'").replace(/İ/g, 'i').toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Verbs: the forms people text, each to its infinitive

const VERB_TABLE: Array<[string, string]> = [
  ['envoyer', 'envoie envoies envoyez envoyons envoient envoyiez enverrai enverrons'],
  ['renvoyer', 'renvoie renvoies renvoyez renvoyons renverrai'],
  ['appeler', 'appelle appelles appelez appelons appeliez appellerai appellerons'],
  ['rappeler', 'rappelle rappelles rappelez rappelons rappeliez rappellerai'],
  ['confirmer', 'confirme confirmes confirmez confirmons confirmerai'],
  ['vérifier', 'vérifie vérifies vérifiez verifie verifies verifiez vérifierai'],
  ['signer', 'signe signes signez signons signerai'],
  ['payer', 'paie paies paye payes payez payons payiez paierai payerai'],
  ['réserver', 'réserve réserves réservez reserve reserves reservez réservons réserverai'],
  ['transférer', 'transfère transfères transférez transfere transferes transferez transférerai'],
  ['préparer', 'prépare prépares préparez prepare prepares preparez préparerai'],
  ['partager', 'partage partages partagez partageons partagerai'],
  ['transmettre', 'transmets transmet transmettez transmettes transmettiez transmettrai'],
  ['faire', 'fais fait faites fasse fasses fassiez ferai ferons'],
  ['dire', 'dis dit dites dise dises disiez dirai redis'],
  ['prendre', 'prends prend prenez prennes preniez prendrai'],
  ['mettre', 'mets mettez mettes mettiez mettrai'],
  ['venir', 'viens venez viennes veniez viendrai'],
  ['passer', 'passe passes passez passiez passerai'],
  ['regarder', 'regarde regardes regardez regarderai'],
  ['donner', 'donne donnes donnez donnerai'],
  ['apporter', 'apporte apportes apportez apporterai'],
  ['ramener', 'ramène ramènes ramenez ramènerai'],
  ['acheter', 'achète achètes achetez achèterai'],
  ['écrire', 'écris écrit écrivez écrives écrirai'],
  ['lire', 'lis lisez lises lirai'],
  ['répondre', 'réponds répond répondez répondes répondrai'],
  ['rendre', 'rends rendez rendes rendrai'],
  ['prévenir', 'préviens prévenez préviennes préviendrai'],
  ['tenir', 'tiens tient tenez tenons tiennes tiendrai'],
  ['revenir', 'reviens revient revenez revenons reviendrai'],
  ['déposer', 'dépose déposes déposez déposerai'],
  ['remplir', 'remplis remplissez remplisses remplirai'],
  ['finir', 'finis finissez finisses finirai'],
  ['valider', 'valide valides validez validerai'],
  ['corriger', 'corrige corriges corrigez corrigerai'],
  ['contacter', 'contacte contactes contactez contacterai'],
  ['recontacter', 'recontacte recontactes recontactez recontactons recontacterai'],
  ['relancer', 'relance relances relancez relancerai'],
  ['imprimer', 'imprime imprimes imprimez imprimerai'],
  ['commander', 'commande commandes commandez commanderai'],
  ['annuler', 'annule annules annulez annulerai'],
  ['ajouter', 'ajoute ajoutes ajoutez ajouterai'],
  ['livrer', 'livre livres livrez livrons livrerai livrerons'],
  ['montrer', 'montre montres montrez montrerai'],
  ['filer', 'file files filez filerai'],
  ['occuper', 'occupe occupes occupez occupons occuperai'],
  ['charger', 'charge charges chargez chargeons chargerai'],
  ['rejoindre', 'rejoins rejoint rejoignez rejoindrai'],
  ['retrouver', 'retrouve retrouves retrouvez retrouverai'],
  ['aller', 'irai irons'],
];
const VERB_FORMS = new Map<string, string>();
const KNOWN_INFINITIVES = new Set<string>();
for (const [infinitive, forms] of VERB_TABLE) {
  KNOWN_INFINITIVES.add(infinitive);
  for (const form of forms.split(' ')) VERB_FORMS.set(form, infinitive);
}
/** Words ending like an infinitive that aren't one. */
const NOT_INFINITIVE = new Set(
  'soir hier mer père mère frère dossier cahier papier premier dernier entier hiver enfer lettre autre notre votre leur cher chère sur pour par quatre super bar mardi mercredi'.split(
    ' ',
  ),
);

/** The infinitive of a verb as texted ("envoies", "enverrai", "vérifiez"), or null if it isn't one. */
function infinitiveOf(word: string): string | null {
  const w = word.toLowerCase();
  const known = VERB_FORMS.get(w);
  if (known) return known;
  if (KNOWN_INFINITIVES.has(w)) return w;
  if (NOT_INFINITIVE.has(w) || w.length < 4) return null;
  if (/(?:er|ir|re|oir)$/.test(w)) return w;
  if (/erai$/.test(w)) return w.replace(/erai$/, 'er');
  if (/irai$/.test(w)) return w.replace(/irai$/, 'ir');
  if (/iez$/.test(w) && w.length > 5) return w.replace(/iez$/, 'er');
  if (/ez$/.test(w) && w.length > 4) return w.replace(/ez$/, 'er');
  return null;
}

/** The commands a sentence may open with ("Envoie-moi le contrat"): a short list, as English. */
const IMPERATIVES = new Set(
  (
    'envoie envoyez renvoie renvoyez appelle appelez rappelle rappelez confirme confirmez ' +
    'vérifie vérifiez verifie verifiez signe signez paie paye payez réserve réservez reserve ' +
    'reservez transfère transférez transfere transferez prépare préparez prepare preparez ' +
    'transmets transmettez partage partagez dis dites préviens prévenez réponds répondez relance ' +
    'relancez remplis remplissez ramène ramenez apporte apportez achète achetez commande ' +
    'commandez annule annulez imprime imprimez valide validez corrige corrigez contacte ' +
    'contactez ajoute ajoutez regarde regardez tiens tenez dépose déposez'
  ).split(' '),
);

/** Verbs whose object is handed over, so waiting on the thing says it all. */
const HANDOVER = new Set(
  'envoyer renvoyer transférer transmettre partager donner apporter ramener rendre déposer remettre retourner poster filer livrer'.split(
    ' ',
  ),
);
/** Verbs that are said with themselves as object ("s'occuper de"): their own "me" or "te" is "se". */
const PRONOMINAL = new Set(
  'occuper charger renseigner assurer organiser arranger inscrire'.split(' '),
);
const MODALS = new Set(['pouvoir', 'devoir', 'aller']);
/** "Je vais être", "je vais essayer": no promise to do anything. */
const NOT_PROMISED = new Set(
  'être avoir essayer tenter penser croire savoir falloir mourir réfléchir rester'.split(' '),
);
/** "Tu peux pas savoir", "tu pourrais croire", "vous pouvez me joindre au": no ask. */
const NOT_ASKED = new Set(
  'croire imaginer penser rêver savoir compter joindre contacter trouver consulter retrouver avoir être'.split(
    ' ',
  ),
);

// ---------------------------------------------------------------------------------------------
// Clauses

const CLITIC = /^(?:me|te|se|nous|vous|lui|leur|le|la|les|y|en|m'|t'|s'|l')$/;
const SUBJECT = /^(?:je|j'|tu|vous|on|nous)$/;
/** The order clitics stand in before an infinitive ("me le", "le lui", "m'en"). */
const CLITIC_RANK: Record<string, number> = {
  me: 0,
  "m'": 0,
  te: 0,
  "t'": 0,
  se: 0,
  "s'": 0,
  nous: 0,
  vous: 0,
  le: 1,
  la: 1,
  les: 1,
  "l'": 1,
  lui: 2,
  leur: 2,
  y: 3,
  en: 4,
};
/** "Envoie-moi", "envoie-le-moi": the pronouns after a command, as they'd stand before an infinitive. */
const AFTER_COMMAND: Record<string, string> = {
  moi: 'me',
  toi: 'te',
  nous: 'nous',
  vous: 'vous',
  lui: 'lui',
  leur: 'leur',
  le: 'le',
  la: 'la',
  les: 'les',
  y: 'y',
  en: 'en',
};

const COURTESY =
  "(?:stp|svp|s'il\\s+te\\s+pla[iî]t|s'il\\s+vous\\s+pla[iî]t|merci(?:\\s+beaucoup|\\s+d'avance|\\s+bien)?|please|pls|plz|rapidement|vite|asap|dès\\s+que\\s+possible|au\\s+plus\\s+vite|si\\s+possible|bisous|bises)";
const TRAILING_COURTESY = re(`(?:[\\s,]+${COURTESY})+[\\s.!?,;:]*$`);
/** "Plus tard", "tout de suite": when, said after the thing. */
const TRAILING_WHEN = re(
  "\\s+(?:plus\\s+tard|tout\\s+à\\s+l'heure|tout\\s+de\\s+suite|bientôt|sous\\s+peu|dans\\s+la\\s+journée|dans\\s+la\\s+soirée|dans\\s+la\\s+matinée|au\\s+plus\\s+tard|sans\\s+faute)$",
  'iu',
);
const LEADING_COURTESY = re(`^(?:${COURTESY}[\\s,]+)+`);
/** What a date's words leave behind ("avant ", "d'ici "), and what follows the thing asked for. */
const DANGLING = re(
  "\\s+(?:avant|d'ici|pour|à|a|vers|jusqu'à|jusqu'au|au\\s+plus\\s+tard|le|la|dans|en|dès|pour\\s+le|d'ici\\s+le|avant\\s+le)\\s*$",
);
/** Where a clause ends: a second verb, a reason, a condition. */
const CLAUSE_END = re(
  "\\s(?:et|mais|car|parce|quand|lorsque|lorsqu'|dès\\s+que|dès\\s+qu'|si|s'il|puis|pour\\s+que|pour\\s+qu'|avant\\s+de|avant\\s+d'|une\\s+fois|sinon|comme|ou|alors|donc|ensuite)(?=\\s|$).*$",
);
/** Where the thing itself ends: "le contrat | à Paul", "une table | pour 4". */
const OBJECT_END = re(
  "\\s(?:à|au|aux|a|pour|avec|par|avant|après|dans|chez|sur|vers|dès|d'ici|jusqu'à|jusqu'au|en|pendant|depuis|sans)(?=\\s|$).*$",
);
const DETERMINERS =
  /^(?:(?:le|la|les|un|une|des|du|de|mon|ma|mes|ton|ta|tes|votre|vos|notre|nos|son|sa|ses|leur|leurs|ce|cet|cette|ces|au|aux|à|moi|toi|nous|vous|lui|tout|toute|tous|toutes|bien|juste|aussi|encore|déjà|stp|svp)\s+|(?:l'|d'))+/iu;
/** What points back at something said earlier instead of naming it. */
const POINTING =
  /^(?:ça|ca|cela|ceci|tout\s+ça|le\s+tout|celui-ci|celle-ci|ceux-ci|celles-ci|tout)$/iu;

function tidy(clause: string): string {
  let out = clause.replace(/’/g, "'").replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/[.!?,;:…]+$/u, '')
      .replace(TRAILING_COURTESY, '')
      .replace(TRAILING_WHEN, '')
      .replace(DANGLING, '')
      .trim();
  }
  return out.replace(LEADING_COURTESY, '').trim();
}

function tokensOf(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    // "jte", "jvous": texted without the apostrophe.
    let w = raw.replace(/^j(te|vous|lui|leur)$/iu, "j' $1");
    if (w !== raw) {
      out.push(...w.split(' '));
      continue;
    }
    let m = /^(m|t|s|l|j)'(.+)$/iu.exec(w);
    while (m) {
      out.push(`${m[1]!.toLowerCase()}'`);
      w = m[2]!;
      m = /^(m|t|s|l|j)'(.+)$/iu.exec(w);
    }
    out.push(w);
  }
  return out;
}

/** Words back into text: an elided clitic joins the next word ("l'" + "envoyer"). */
function joinWords(words: string[]): string {
  let out = '';
  for (const w of words) out += out && !out.endsWith("'") ? ` ${w}` : w;
  return out;
}

/** "le" before "envoyer" is "l'": a clitic loses its vowel before one. */
function elide(words: string[]): string[] {
  return words.map((w, i) => {
    const next = words[i + 1];
    if (next && /^(?:me|te|se|le|la)$/.test(w) && /^[aeiouyéèêàâîôûh]/iu.test(next))
      return `${w[0]}'`;
    return w;
  });
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface VerbPhrase {
  infinitive: string;
  clitics: string[];
  /** The words after the verb, as written. */
  rest: string[];
}

/**
 * The verb a clause starts with, past its subject and clitics ("tu m'envoies le devis",
 * "t'envoyer le contrat", "envoie-moi le doc"), or null when the clause doesn't start with one.
 */
function verbPhrase(
  clause: string,
  opts: { subject?: boolean; infinitive?: boolean },
): VerbPhrase | null {
  const words = tokensOf(clause);
  let i = 0;
  if (opts.subject && SUBJECT.test(words[0]?.toLowerCase() ?? '')) i += 1;
  const clitics: string[] = [];
  while (i < words.length && CLITIC.test(words[i]!.toLowerCase()))
    clitics.push(words[i++]!.toLowerCase());
  const raw = words[i];
  if (!raw) return null;
  const [verb = '', ...after] = raw.split('-');
  // "Envoie-moi": the pronouns after a command stand where they'd stand before an infinitive.
  for (const p of after) {
    const c = AFTER_COMMAND[p.toLowerCase()];
    if (!c) return null;
    clitics.push(c);
  }
  const lower = verb.toLowerCase();
  const infinitive = opts.infinitive
    ? KNOWN_INFINITIVES.has(lower) ||
      (lower.length >= 3 && /(?:er|ir|re|oir)$/.test(lower) && !NOT_INFINITIVE.has(lower))
      ? lower
      : null
    : infinitiveOf(lower);
  if (!infinitive) return null;
  return { infinitive, clitics, rest: words.slice(i + 1) };
}

/**
 * A clause into an action: "t'envoyer le contrat signé" reads "Envoyer le contrat signé", the
 * thing "Contrat signé"; "te l'envoyer" keeps its pronouns ("Te l'envoyer"), the thing unnamed.
 * `person` is who does it: the sender (1) or the reader (2), whose own "me" or "te" is "se".
 */
function toAction(
  phrase: VerbPhrase,
  person: 1 | 2,
  ctx: SentenceContext,
  at: number,
): ActionClause {
  let { infinitive } = phrase;
  let rest = joinWords(phrase.rest);
  if (infinitive === 'tenir' && /^au\s+courant/iu.test(rest)) {
    infinitive = 'tenir au courant';
    rest = rest.replace(/^au\s+courant\s*/iu, '');
  } else if (infinitive === 'revenir' && /^vers\s+(?:toi|vous)/iu.test(rest)) {
    infinitive = `revenir ${rest.match(/^vers\s+(?:toi|vous)/iu)![0].toLowerCase()}`;
    rest = rest.replace(/^vers\s+(?:toi|vous)\s*/iu, '');
  } else if (infinitive === 'faire' && /^(?:suivre|parvenir)/iu.test(rest)) {
    infinitive = `faire ${rest.match(/^(?:suivre|parvenir)/iu)![0].toLowerCase()}`;
    rest = rest.replace(/^(?:suivre|parvenir)\s*/iu, '');
  }
  rest = rest.replace(CLAUSE_END, '').trim();
  const named = rest.replace(OBJECT_END, '').trim();
  const thing = named.replace(DETERMINERS, '').trim();
  const own = person === 1 ? /^(?:me|m')$/ : /^(?:te|t')$/;
  const clitics = phrase.clitics
    .map((c) => (own.test(c) || (c === 'vous' && PRONOMINAL.has(infinitive)) ? 'se' : c))
    .map((c) => (c === "m'" || c === "t'" || c === "s'" ? `${c[0]}e` : c === "l'" ? 'le' : c))
    .sort((a, b) => (CLITIC_RANK[a] ?? 0) - (CLITIC_RANK[b] ?? 0));
  // With the thing named, only "se" stays ("S'occuper de la réservation"); without it the
  // pronouns are what it's about ("T'appeler", "L'envoyer").
  const kept = named ? clitics.filter((c) => c === 'se') : clitics;
  const head = joinWords(elide([...kept, ...infinitive.split(' ')]));
  const title = capitalise(named ? `${head} ${named}` : head);
  const object = thing && !POINTING.test(thing) ? capitalise(thing) : null;
  return {
    title,
    object,
    handover: HANDOVER.has(infinitive.split(' ')[0]!) || /^faire\s/.test(infinitive),
    when: dateOfClause(ctx, CLAUSE_BREAK, at),
    quote: ctx.said,
  };
}

/** The clause from `start` in the sentence, its dates taken out. */
function clauseAt(ctx: SentenceContext, start: number): string {
  return tidy(removeRanges(ctx.text.slice(start), ctx.index + start, ctx.dates));
}

// ---------------------------------------------------------------------------------------------
// Vocabulary

const NEGATION_AFTER = re(`^\\s*(?:pas|jamais|plus(?!\\s+(?:tard|tôt|vite))|rien|point)${E}`);
/** A negation or a doubt before a promise ("je pourrai pas", "si je", "peut-être que je"). */
const NEGATIVE_BEFORE = re(
  `${B}(?:ne|n'|pas|jamais|plus|rien|impossible|si|s'il|peut-être|peut-etre|sais\\s+pas|pas\\s+sûr|pas\\s+sur)${E}`,
);
const CLAUSE_BREAK = /[,;]|(?<![\p{L}])(?:mais|et|donc|alors|puis|sinon|par\s+contre)(?![\p{L}])/gu;

/** "Je vais", "on va", "je compte", "je promets de": an infinitive follows. */
const COMMIT_THEN_INFINITIVE = re(
  `${B}(?:je\\s+vais|j'\\s?vais|jvais|on\\s+va|nous\\s+allons|je\\s+compte|j'compte|je\\s+(?:te\\s+|vous\\s+)?promets\\s+(?:de\\s+|d')|je\\s+m'engage\\s+(?:à|a)\\s+)(?:${E}|(?<=')|(?<=\\s))`,
);
/** "Je t'envoie", "on vous rappelle": the present promises, for the verbs that promise. */
const COMMIT_PRESENT = re(
  `${B}(?:(?:je\\s+|j'|on\\s+|nous\\s+)(?:(?:te|vous|lui|leur)\\s+|t')|jte\\s+|jvous\\s+)(?:(?:le|la|les)\\s+|l')?(?:envoie|envoyons|renvoie|renvoyons|appelle|appelons|rappelle|rappelons|confirme|confirmons|transf[eè]re|transférons|paie|paye|payons|r[eé]serve|réservons|transmets|transmet|transmettons|partage|partageons|fais\\s+(?:suivre|parvenir)|fait\\s+(?:suivre|parvenir)|faisons\\s+(?:suivre|parvenir)|livre|livrons|dis|dit|redis|tiens\\s+au\\s+courant|tient\\s+au\\s+courant|tenons\\s+au\\s+courant|recontacte|recontactons|rejoins|retrouve|reviens|revient|revenons|réponds|répond|répondons|prépare|préparons|apporte|ramène|écris|écrivons)${E}`,
);
/** "Je passe te voir samedi", "on passe chez vous": a visit in the present, promised. */
const COMMIT_VISIT = re(
  `${B}(?:je|on|nous)\\s+(?:passe|passons)\\s+(?:(?:te|vous)\\s+(?:voir|chercher|prendre|récupérer|recuperer)|chez\\s+(?:toi|vous))${E}`,
);
/** "J'enverrai", "je te le ferai", "je passerai". */
const COMMIT_FUTURE = re(
  `${B}(?:je\\s+|j')(?:(?:te|vous|lui|leur|le|la|les|me|nous|en|y)\\s+|[tml]')*(\\p{L}+rai)${E}`,
);
const NOT_A_PROMISE_FUTURE = new Set(
  'serai aurai pourrai verrai saurai devrai essaierai essayerai voudrai tâcherai tenterai penserai faudrai'.split(
    ' ',
  ),
);
/** "Je m'en occupe", "je m'occupe de la réservation", "on s'en charge". */
const COMMIT_HANDLE = re(
  `${B}(?:je\\s+m'|je\\s+me\\s+|on\\s+s'|on\\s+se\\s+|nous\\s+nous\\s+)(?:en\\s+)?(?:occupe|occupons|charge|chargeons)${E}`,
);
/** "Je reviens vers vous": I'll get back to you. */
const COMMIT_GET_BACK = re(
  `${B}(?:je|on|nous)\\s+(?:reviens|revient|revenons)\\s+vers\\s+(?:toi|vous)${E}`,
);
const COMMIT_COUNT_ON_ME = re(`${B}(?:compte|comptez)\\s+sur\\s+(?:moi|nous)${E}(?:\\s+pour\\s+)?`);
/** "Je vous envoie ci-joint": sent now, not promised. */
const SENT_NOW = re(
  `ci-joint|ci\\s+joint|pièce\\s+jointe|pi[eè]ces\\s+jointes|${B}pj${E}|en\\s+attachement`,
);

const ASK_THEN_INFINITIVE = re(
  `${B}(?:(?:est-ce\\s+que|est\\s+ce\\s+que)\\s+)?(?:tu\\s+(?:peux|pourrais|pourras|veux\\s+bien|voudrais\\s+bien)|t'(?:peux|pourrais)|vous\\s+(?:pouvez|pourriez|pourrez|voulez\\s+bien|voudriez\\s+bien)|(?:peux|pourrais|pourras)[- ]tu|(?:pouvez|pourriez|pourrez|voudriez)[- ]vous|veux[- ]tu\\s+bien|voulez[- ]vous\\s+bien|merci\\s+de\\s+bien\\s+vouloir|merci\\s+(?:de|d')|n'oublie\\s+pas\\s+(?:de|d')|oublie\\s+pas\\s+(?:de|d')|n'oubliez\\s+pas\\s+(?:de|d')|oubliez\\s+pas\\s+(?:de|d')|pense\\s+(?:à|a)|pensez\\s+(?:à|a)|veuillez|je\\s+(?:te|vous)\\s+(?:demande|prie)\\s+(?:de|d'))(?:${E}|(?<='))`,
);
/** "Tu peux…" said as permission, not an ask ("tu peux venir quand tu veux"). */
const PERMISSION = re(
  "quand\\s+tu\\s+veux|si\\s+tu\\s+veux|quand\\s+vous\\s+voulez|si\\s+vous\\s+voulez|si\\s+besoin|si\\s+nécessaire|si\\s+tu\\s+as\\s+besoin|si\\s+vous\\s+avez\\s+besoin|à\\s+tout\\s+moment|n'importe\\s+quand|comme\\s+tu\\s+veux|comme\\s+vous\\s+voulez|si\\s+ça\\s+te\\s+dit|si\\s+ça\\s+vous\\s+dit",
);
const MAY_PERMIT = /^(?:est|tu|t'|vous|peux|pouvez|pourr)/u;
/** "J'ai besoin que tu", "il faut que tu": a subjunctive follows. */
const ASK_THEN_SUBJUNCTIVE = re(
  `${B}(?:(?:j'ai|j'aurais|on\\s+a|on\\s+aurait|nous\\s+avons|nous\\s+aurions)\\s+besoin\\s+(?:que\\s+tu|que\\s+vous|qu'on)|(?:il\\s+)?(?:faut|faudrait|faudra)\\s+(?:que\\s+tu|que\\s+vous|qu'tu)|ce\\s+serait\\s+(?:bien|top|super|cool|gentil|sympa|parfait)\\s+(?:que\\s+tu|que\\s+vous))${E}`,
);
/** "Tu m'envoies l'adresse ?": the present, asked of the reader, for something done for the sender. */
const ASK_PRESENT = re(
  `^(?:tu|vous)\\s+(?:m'|me\\s+|nous\\s+)(?:(?:le|la|les)\\s+|l')?(?:envoies|envoyez|renvoies|renvoyez|appelles|appelez|rappelles|rappelez|confirmes|confirmez|transf[eè]res|transférez|passes|passez|dis|dites|donnes|donnez|prépares|préparez|réserves|réservez|montres|montrez|files|filez|ramènes|ramenez|apportes|apportez|achètes|achetez|fais\\s+suivre|faites\\s+suivre|tiens\\s+au\\s+courant|tenez\\s+au\\s+courant|réponds|répondez|écris|écrivez|transmets|transmettez|partages|partagez)${E}`,
);
const COURTESY_ANYWHERE = re(
  `${B}(?:stp|svp|s'il\\s+te\\s+pla[iî]t|s'il\\s+vous\\s+pla[iî]t|please|pls|plz|merci\\s+d'avance)${E}`,
);

/** What a sentence is often opened with and never part of. */
const FILLER_START =
  /^(?:(?:bon|alors|ok|okay|oké|donc|du\s+coup|parfait|super|top|très\s+bien|ben|bah|voilà|ouais|oui|bref|ainsi|et|sinon|au\s+fait|ah|oh|eh|tiens|écoute|écoutez|dis|hey|stp|svp|s'il\s+te\s+pla[iî]t|s'il\s+vous\s+pla[iî]t)(?:[\s,:!.]+|$))+/iu;
const GREETING_START =
  /^(?:salut|bonjour|bonsoir|coucou|hello|hey|hi)(?:\s+[\p{L}-]+){0,2}\s*[,!]\s*/iu;

const QUESTION_START = re(
  `^(?:(?:à|a|de|avec|pour|depuis|jusqu'à|par)\\s+(?:quel|quelle|quels|quelles|qui|quoi|combien|quand)${E}|d'où${E}|est-ce|est\\s+ce|qu'est-ce|qu'est\\s+ce|c'est\\s+(?:quoi|quand|où|ou|combien|qui|comment)|quand${E}(?!\\s+(?:même|tu\\s+veux|vous\\s+voulez|tu\\s+peux|vous\\s+pouvez))|où${E}(?!\\s+que)|ou\\s+(?:est|sont|en\\s+est|es|t'es|tu|on|il|elle)${E}|qui\\s+(?:est|sont|a|peut|pourrait|vient|veut|fait|s'occupe|va|prend|était|gère|connait|connaît|est-ce|d'entre|l'a|m'a|t'a|paie|paye|s'en|viendra|sera|doit|aurait|serait)${E}|comment${E}(?!\\s+dire)|pourquoi${E}(?!\\s+pas)|combien${E}|(?:quel|quelle|quels|quelles|lequel|laquelle|lesquels|lesquelles)${E}(?!\\s+(?:chance|dommage|horreur|surprise|plaisir|joie|bonheur|belle|beau|bonne|bon|journée|histoire|galère|idée|honte|bêtise|blague|angoisse|misère|classe|coïncidence|aventure|merveille|tristesse|soirée|ambiance|vue)${E})|(?:peux|pouvez|pourrais|pourriez|pourrait|avez|as|aurais|auriez|êtes|es|est|sont|savez|sais|voulez|veux|voudrais|voudriez|allez|vas|va|venez|viens|vient|faut|peut|doit|dois|devez|devrais|devriez|a|ont|penses|pensez|crois|croyez|connais|connaissez|trouves|trouvez|préfères|préférez|aimes|aimez|prends|prenez|fais|faites|fait|serait|sera|seras|serez|seriez|serais|avons|pouvons|devons|sommes|allons)-(?:t-)?(?:je|tu|il|elle|on|nous|vous|ils|elles)${E}|(?:tu\\s+es|t'es|vous\\s+êtes|t'as|tu\\s+as|vous\\s+avez)\\s+(?:toujours\\s+|bien\\s+)?(?:dispo|disponibles?|libres?|là|ok|d'accord|partante?|chaude?|sûre?|arrivée?|reçu|vu|eu)${E}|ça\\s+(?:te|vous)\\s+(?:va|dit|convient)${E})`,
);

const CONFIRM = re(
  `^(?:(?:ok(?:ay|é)?|oké|d'accord|d'acc|dac|ça\\s+marche|ca\\s+marche|parfait|entendu|c'est\\s+noté|noté|bien\\s+reçu|reçu|oui|ouais|ça\\s+me\\s+va|ca\\s+me\\s+va|top|super|nickel|impec(?:cable)?|pas\\s+de\\s+(?:souci|soucis|problème|probleme)|sans\\s+souci|validé|c'est\\s+bon|très\\s+bien|bien\\s+sûr|avec\\s+plaisir|je\\s+confirme|confirmé|c'est\\s+parfait|génial|ça\\s+roule|carrément|volontiers|👍|✅)[\\s.!,]*)+(?:merci(?:\\s+beaucoup|\\s+bien)?[\\s.!👍]*)?$`,
);

const DECISION = re(
  `${B}(on\\s+a\\s+(?:décidé|decide)(?:\\s+(?:de|que)${E}|\\s+(?:d'|qu'))?|nous\\s+avons\\s+(?:décidé|decide)(?:\\s+(?:de|que)${E}|\\s+(?:d'|qu'))?|j'ai\\s+(?:décidé|decide)(?:\\s+(?:de|que)${E}|\\s+(?:d'|qu'))?|c'est\\s+décidé\\s*:?|décision\\s+(?:finale|prise)\\s*:?|on\\s+part\\s+(?:sur|avec)${E}|on\\s+reste\\s+sur${E}|on\\s+retient${E}|on\\s+choisit${E}|on\\s+a\\s+choisi${E}|nous\\s+avons\\s+choisi${E}|on\\s+opte\\s+pour${E}|(?:on\\s+a|nous\\s+avons|j'ai)\\s+opté\\s+pour${E}|on\\s+garde${E}(?!\\s+(?:le\\s+contact|contact|espoir|le\\s+moral|la\\s+pêche|en\\s+tête|un\\s+œil|le\\s+cap))|on\\s+y\\s+va\\s+avec${E}|on\\s+valide${E}|nous\\s+validons${E}|c'est\\s+validé${E}|validée?s?${E}|c'est\\s+acté${E}|acté${E}|on\\s+a\\s+convenu(?:\\s+(?:de|que)${E}|\\s+(?:d'|qu'))?|nous\\s+avons\\s+convenu(?:\\s+(?:de|que)${E}|\\s+(?:d'|qu'))?|c'est\\s+convenu${E}|d'accord\\s+pour${E}|c'est\\s+approuvé${E}|approuvée?s?${E}|on\\s+approuve${E}|on\\s+a\\s+tranché${E}|c'est\\s+tranché${E}|c'est\\s+réglé${E})`,
);
/** A decision taken back or in doubt in the words before it ("pas validé", "si on part sur"). */
const NOT_DECIDED = re(
  `${B}(?:pas|plus|jamais|non|ni|si|s'il|peut-être|peut-etre|sans|avant|quand|une\\s+fois|espère|j'espère|espérons|à\\s+condition|tant\\s+que|dès\\s+que|est-ce\\s+qu|est-ce\\s+que|faut\\s+voir|reste\\s+à|à\\s+voir|comme)${E}[^.!?]{0,25}$`,
);

export const FR_PAY = re(
  `${B}(?:payer|payé|payée|payés|paye|paie|paiement|paiements|facture|factures|facturé|virement|remboursement|rembourser|remboursé|acompte|devis|reçu|prix|régler|réglé|réglée|tarif|montant|versement)${E}`,
  'iu',
);
export const FR_PAID = re(
  `${B}(?:payé|payée|facture|paiement|virement|remboursement|remboursé|réglé|réglée|acompte)${E}`,
  'iu',
);
export const FR_PLAN = re(
  `${B}(?:réunion|rendez-vous|rdv|appel|déjeuner|dej|dîner|diner|café|on\\s+se\\s+voit|on\\s+se\\s+retrouve|on\\s+se\\s+capte|tu\\s+es\\s+dispo|t'es\\s+dispo|dispo|disponible|visio|apéro|resto|voyage|visite)${E}`,
  'iu',
);
export const FR_TRACK = re(
  `${B}(?:livraison|livré|livrée|expédié|expédiée|colis|suivi|en\\s+cours\\s+de\\s+livraison|numéro\\s+de\\s+suivi|en\\s+transit|transporteur|coursier)${E}`,
  'iu',
);

// ---------------------------------------------------------------------------------------------

function readDecision(ctx: SentenceContext, f: string): SentenceReading['decision'] {
  const d = DECISION.exec(f);
  if (!d || NOT_DECIDED.test(f.slice(0, d.index))) return null;
  const trigger = d[1]!;
  const rest = tidy(ctx.text.slice(d.index + d[0].length)).replace(/^[\s,:;.!-]+/u, '');
  // "On a décidé de partir avec B" is "Partir avec B"; anything else reads as it was said.
  const title =
    rest && /(?:décidé|decide|convenu)\s+(?:de|que|d'|qu')$|:$/u.test(trigger.trim())
      ? rest
      : tidy(ctx.text.replace(/’/g, "'").replace(GREETING_START, '').replace(FILLER_START, ''));
  return { title: capitalise(title), quote: ctx.said };
}

function negatedBefore(f: string, at: number): boolean {
  let from = 0;
  for (const b of f.slice(0, at).matchAll(CLAUSE_BREAK)) from = b.index + b[0].length;
  return NEGATIVE_BEFORE.test(f.slice(from, at));
}

function readCommitment(ctx: SentenceContext, f: string, asked: boolean): ActionClause | null {
  // Every form is tried; the promise is the first one said.
  const found: Array<{ at: number; action: ActionClause }> = [];
  const consider = (
    m: RegExpExecArray | null,
    read: (m: RegExpExecArray) => ActionClause | null,
  ) => {
    if (!m || negatedBefore(f, m.index)) return;
    if (NEGATION_AFTER.test(f.slice(m.index + m[0].length))) return;
    const action = read(m);
    if (action) found.push({ at: m.index, action });
  };

  consider(COMMIT_THEN_INFINITIVE.exec(f), (m) => {
    let phrase = verbPhrase(clauseAt(ctx, m.index + m[0].length), { infinitive: true });
    // "Je vais pouvoir te l'envoyer": the promise is the second verb.
    while (phrase && MODALS.has(phrase.infinitive) && phrase.rest.length) {
      const next = verbPhrase(joinWords(phrase.rest), { infinitive: true });
      if (!next) break;
      phrase = next;
    }
    if (!phrase || NOT_PROMISED.has(phrase.infinitive)) return null;
    if (phrase.infinitive === 'voir' && !phrase.rest.length) return null;
    return toAction(phrase, 1, ctx, m.index);
  });
  if (!asked && !SENT_NOW.test(f)) {
    consider(COMMIT_PRESENT.exec(f), (m) => {
      // "Je te confirme que c'est bon", "je te dis que…": said now, not promised.
      if (/^\s*(?:que|qu')/u.test(f.slice(m.index + m[0].length))) return null;
      const phrase = verbPhrase(clauseAt(ctx, m.index), { subject: true });
      return phrase ? toAction(phrase, 1, ctx, m.index) : null;
    });
  }
  consider(COMMIT_VISIT.exec(f), (m) => {
    const phrase = verbPhrase(clauseAt(ctx, m.index), { subject: true });
    return phrase ? toAction(phrase, 1, ctx, m.index) : null;
  });
  consider(COMMIT_FUTURE.exec(f), (m) => {
    if (NOT_A_PROMISE_FUTURE.has(m[1]!)) return null;
    const phrase = verbPhrase(clauseAt(ctx, m.index), { subject: true });
    return phrase ? toAction(phrase, 1, ctx, m.index) : null;
  });
  consider(COMMIT_HANDLE.exec(f), (m) => {
    const phrase = verbPhrase(clauseAt(ctx, m.index), { subject: true });
    return phrase ? toAction(phrase, 1, ctx, m.index) : null;
  });
  consider(COMMIT_GET_BACK.exec(f), (m) => {
    const phrase = verbPhrase(clauseAt(ctx, m.index), { subject: true });
    return phrase ? toAction(phrase, 1, ctx, m.index) : null;
  });
  consider(COMMIT_COUNT_ON_ME.exec(f), (m) => {
    const phrase = verbPhrase(clauseAt(ctx, m.index + m[0].length), { infinitive: true });
    if (phrase && !NOT_PROMISED.has(phrase.infinitive)) return toAction(phrase, 1, ctx, m.index);
    return toAction({ infinitive: 'occuper', clitics: ['me', 'en'], rest: [] }, 1, ctx, m.index);
  });
  found.sort((a, b) => a.at - b.at);
  return found[0]?.action ?? null;
}

function readRequest(ctx: SentenceContext, f: string, asked: boolean): ActionClause | null {
  const ask = ASK_THEN_INFINITIVE.exec(f);
  if (ask && !NEGATION_AFTER.test(f.slice(ask.index + ask[0].length))) {
    const permits = MAY_PERMIT.test(ask[0]) && PERMISSION.test(f);
    const phrase = permits
      ? null
      : verbPhrase(clauseAt(ctx, ask.index + ask[0].length), { infinitive: true });
    if (phrase && !NOT_ASKED.has(phrase.infinitive)) return toAction(phrase, 2, ctx, ask.index);
  }
  const must = ASK_THEN_SUBJUNCTIVE.exec(f);
  if (must) {
    const phrase = verbPhrase(clauseAt(ctx, must.index + must[0].length), {});
    if (phrase && !NOT_ASKED.has(phrase.infinitive)) return toAction(phrase, 2, ctx, must.index);
  }
  // The sentence as it opens, past a greeting and the words that open anything.
  const offset = (() => {
    const g = GREETING_START.exec(f)?.[0].length ?? 0;
    return g + (FILLER_START.exec(f.slice(g))?.[0].length ?? 0);
  })();
  const opening = f.slice(offset);
  if (ASK_PRESENT.test(opening) && !NEGATION_AFTER.test(opening.replace(ASK_PRESENT, ''))) {
    const phrase = verbPhrase(clauseAt(ctx, offset), { subject: true });
    if (phrase) return toAction(phrase, 2, ctx, offset);
  }
  // "Envoie-moi le contrat", "Signez le formulaire": a command from the list, naming something.
  const first = opening.split(/\s+/)[0]?.split('-')[0] ?? '';
  if (IMPERATIVES.has(first) && !asked) {
    const phrase = verbPhrase(clauseAt(ctx, offset), {});
    const words = opening.split(/\s+/);
    // "Tiens bon" is courage, "tiens-moi au courant" an ask.
    const named =
      phrase &&
      (phrase.clitics.length > 0 ||
        (!/^(?:tiens|tenez)$/u.test(first) &&
          words.length > 1 &&
          /\p{L}/u.test(words.slice(1).join(' '))));
    if (phrase && named) return toAction(phrase, 2, ctx, offset);
  }
  // "Quand tu arrives, appelle-moi": a command with its pronoun, after a comma.
  for (const c of f.matchAll(/,\s*/gu)) {
    const at = c.index + c[0].length;
    const word = /^([\p{L}]+)-(?:moi|nous|lui|leur|le|la|les)(?![\p{L}])/u.exec(f.slice(at));
    if (!word || !IMPERATIVES.has(word[1]!) || asked) continue;
    const phrase = verbPhrase(clauseAt(ctx, at), {});
    if (phrase) return toAction(phrase, 2, ctx, at);
  }
  // "… stp", "svp …": an ask by its courtesy, when the words around it start with a verb.
  if (COURTESY_ANYWHERE.test(f)) {
    const plain = tidy(
      removeRanges(ctx.text, ctx.index, ctx.dates)
        .replace(/’/g, "'")
        .replace(new RegExp(COURTESY_ANYWHERE.source, 'giu'), ' '),
    )
      .replace(GREETING_START, '')
      .replace(FILLER_START, '');
    const phrase = verbPhrase(plain, { subject: true }) ?? verbPhrase(plain, { infinitive: true });
    if (phrase && !NOT_ASKED.has(phrase.infinitive)) return toAction(phrase, 2, ctx, 0);
  }
  return null;
}

/** One French sentence: whether it asks, confirms, decides, promises or asks for something. */
export function readFrench(ctx: SentenceContext): SentenceReading {
  const f = fold(ctx.text);
  const endsWithQuestion = /[?؟]\s*$/u.test(ctx.text);
  const opening = f.replace(GREETING_START, '').replace(FILLER_START, '').trim();
  const asks =
    endsWithQuestion ||
    (QUESTION_START.test(opening) &&
      // "Quand tu arrives, appelle-moi": a when that opens a clause, not a question.
      !(/^quand\s/u.test(opening) && /,\s*\S/u.test(opening)) &&
      ctx.text.length < 160 &&
      !/[.!]$/.test(ctx.text));
  const request = readRequest(ctx, f, endsWithQuestion);
  // "Tu peux m'envoyer le devis" asks as much as it requests, mark or no mark.
  const ask = request ? ASK_THEN_INFINITIVE.exec(f) : null;
  const askedToo = ask !== null && MAY_PERMIT.test(ask[0]) && !/[.!]$/.test(ctx.text);
  return {
    asks: asks || askedToo,
    confirms: CONFIRM.test(f.trim()),
    decision: asks || askedToo ? null : readDecision(ctx, f),
    commitment: readCommitment(ctx, f, endsWithQuestion),
    request,
  };
}
