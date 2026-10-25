/**
 * Whether a message to Cai asks how an organization its writer runs is doing (M17 I15a, R115):
 * "how is Nile Dental doing", "what's waiting at the clinic", "how's business today", in every
 * interface language, by the rules. The words name a place ("Nile Dental", "the clinic") or none
 * ("how's business"); which organization they mean, if any, is the server's to decide from the
 * ones its writer runs, so "how is Sara doing" reads here as a name and is answered as an
 * organization only where Sara is one. `isOrgWord` tells a word for one's organization from a
 * name. `chat-org-golden.test.ts` holds it to its lines. Pure; the server's alone.
 */
import { foldForIntent } from './chat-intent';

/** What was asked: the place named, or null for one's organization unnamed ("how's business"). */
export interface OrgAsk {
  name: string | null;
}

const NAME = '(?<name>[^?!.؟]{2,40}?)';
const WHEN =
  "(?: (?:today|this week|so far|right now|now|اليوم|النهارده|النهاردا|الحين|هلق|هلا|هذا الاسبوع|الاسبوع ده|aujourd'hui|cette semaine|en ce moment|bugün|bu hafta|şu an))?";
const END = '[\\s?!.،؟…]*$';

/** Each a whole message, its name captured where it has one. */
const ASKS: RegExp[] = [
  // English
  new RegExp(
    String.raw`^how(?:'?s| is| are)(?: things| it going| it)? (?:at|with|in|over at) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(String.raw`^how(?:'?s| is) ${NAME} doing${WHEN}${END}`, 'u'),
  new RegExp(
    String.raw`^what(?:'?s| is) (?:waiting|happening|going on|new|up) (?:at|in|with|over at) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(
    String.raw`^(?:give me |send me |any )?(?:an? )?(?:update|status|report|summary|rundown) (?:on|for|from|at) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(
    String.raw`^how(?:'?s| is) (?:business|work|the business)(?: going| doing)?${WHEN}${END}`,
    'u',
  ),
  // Arabic, folded ("ة" is "ه", one alef)
  new RegExp(
    String.raw`^(?:كيف|ايش|شو|وش|ايه|ما|شنو|كيفاش) (?:وضع|اخبار|احوال|حال|احوالها في) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(
    String.raw`^(?:ايش|شو|ايه|وش|ماذا|ما|شنو) (?:في|فيه|صاير|حاصل|الجديد|جديد|اللي بيحصل|اللي صاير) (?:في|عند) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(
    String.raw`^${NAME} (?:عامله ايه|عامل ايه|ماشيه ازاي|ماشي ازاي|كيفها|شو وضعها|ايش وضعها)${WHEN}${END}`,
    'u',
  ),
  new RegExp(String.raw`^(?:كيف|ازاي|شلون) (?:الشغل|العمل|البزنس)(?: ماشي)?${WHEN}${END}`, 'u'),
  // French
  new RegExp(
    String.raw`^comment (?:ça |ca )?(?:va|vont|se passe|marche|tourne)(?: la journée| les choses| le travail)? (?:à|a|chez|dans|pour) ${NAME}${WHEN}${END}`,
    'u',
  ),
  new RegExp(String.raw`^comment (?:va|vont|marche|tourne) ${NAME}${WHEN}${END}`, 'u'),
  new RegExp(String.raw`^quoi de (?:neuf|nouveau) (?:à|a|chez|pour) ${NAME}${WHEN}${END}`, 'u'),
  new RegExp(String.raw`^(?:où|ou) en (?:est|sont) ${NAME}${WHEN}${END}`, 'u'),
  new RegExp(String.raw`^comment (?:vont|marchent) les affaires${WHEN}${END}`, 'u'),
  // Turkish: the place first, then the question ("klinikte işler nasıl").
  new RegExp(
    String.raw`^${NAME}(?:'?(?:da|de|ta|te))? (?:işler|durum)(?: bugün)? (?:nasıl|ne durumda)${END}`,
    'u',
  ),
  new RegExp(String.raw`^${NAME} nasıl gidiyor${WHEN}${END}`, 'u'),
  new RegExp(
    String.raw`^${NAME}(?:'?(?:da|de|ta|te)) (?:ne var|neler var|neler oluyor|ne oluyor)(?: bugün)?${END}`,
    'u',
  ),
  new RegExp(String.raw`^işler nasıl(?: gidiyor)?${WHEN}${END}`, 'u'),
];

/** Words that are someone's own organization, never its name (folded). */
const ORG_WORDS = new Set([
  'business',
  'the business',
  'my business',
  'our business',
  'work',
  'the organization',
  'my organization',
  'the organisation',
  'my organisation',
  'the company',
  'my company',
  'our company',
  'the clinic',
  'my clinic',
  'our clinic',
  'the shop',
  'my shop',
  'the store',
  'my store',
  'the office',
  'the team',
  'my team',
  'our team',
  'the restaurant',
  'the salon',
  'the practice',
  'the studio',
  'the agency',
  'the firm',
  'الشركه',
  'شركتي',
  'العياده',
  'عيادتي',
  'المحل',
  'محلي',
  'الشغل',
  'شغلي',
  'العمل',
  'البزنس',
  'الفريق',
  'المكتب',
  'المطعم',
  'الصالون',
  'المؤسسه',
  'مؤسستي',
  'المنظمه',
  "l'entreprise",
  'mon entreprise',
  'notre entreprise',
  'la boîte',
  'la boite',
  'ma boîte',
  'ma boite',
  'la clinique',
  'ma clinique',
  'le cabinet',
  'mon cabinet',
  'la boutique',
  'ma boutique',
  'le magasin',
  'mon magasin',
  "l'équipe",
  'mon équipe',
  'le bureau',
  'le travail',
  'les affaires',
  "l'organisation",
  'mon organisation',
  'le restaurant',
  'le salon',
  'şirket',
  'şirketim',
  'klinik',
  'kliniğim',
  'dükkan',
  'dükkanım',
  'mağaza',
  'mağazam',
  'ekip',
  'ekibim',
  'ofis',
  'iş',
  'işler',
  'restoran',
  'salon',
  'kurum',
]);

/** Whether a name is a word for one's own organization ("the clinic", "العيادة", "şirket"). */
export function isOrgWord(name: string): boolean {
  return ORG_WORDS.has(foldForIntent(name).replace(/'(?:da|de|ta|te)$/, ''));
}

/** Whether the message asks how an organization is doing, and the place it names if any. */
export function chatOrg(text: string): OrgAsk | null {
  const t = foldForIntent(text);
  if (!t || t.length > 90) return null;
  for (const rx of ASKS) {
    const m = rx.exec(t);
    if (!m) continue;
    const name = m.groups?.name?.trim() ?? null;
    return { name: name && !isOrgWord(name) ? name : null };
  }
  return null;
}
