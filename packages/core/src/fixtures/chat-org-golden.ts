/**
 * What people who run an organization write to Cai about how it's doing (M17 I15a), labelled by
 * hand: `name` is the place the words name as written (folded, lower case), null for one's own
 * organization unnamed ("how's business", "the clinic"), and `org: false` for everything near it
 * that isn't asked of an organization at all (a greeting, small talk, what's new for oneself, an
 * opening hour). A name may be a person's ("how is Sara doing"): the rules read the shape, the
 * server reads whether it's an organization its writer runs. `chat-org-golden.test.ts` holds every
 * language to all of its lines.
 */
export interface OrgLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  org: boolean;
  name?: string | null;
}

export const CHAT_ORG_GOLDEN: OrgLine[] = [
  // ---- English
  { text: 'How is Nile Dental doing?', lang: 'en', org: true, name: 'nile dental' },
  { text: "how's the clinic doing today", lang: 'en', org: true, name: null },
  { text: 'What is waiting at Nile Dental?', lang: 'en', org: true, name: 'nile dental' },
  { text: "what's happening at the shop", lang: 'en', org: true, name: null },
  { text: 'How are things at Acme this week?', lang: 'en', org: true, name: 'acme' },
  { text: "how's business?", lang: 'en', org: true, name: null },
  { text: 'give me an update on Acme', lang: 'en', org: true, name: 'acme' },
  { text: 'status for my company', lang: 'en', org: true, name: null },
  { text: 'how are you?', lang: 'en', org: false },
  { text: "what's new?", lang: 'en', org: false },
  { text: 'how is it going', lang: 'en', org: false },
  { text: 'when does the shop open on Friday?', lang: 'en', org: false },
  { text: 'how do I add my business', lang: 'en', org: false },
  // ---- Arabic, as Cairo, the Gulf, the Levant and the Standard write it
  { text: 'إيه أخبار العيادة النهارده؟', lang: 'ar', org: true, name: null },
  { text: 'كيف وضع نايل دنتال اليوم', lang: 'ar', org: true, name: 'نايل دنتال' },
  { text: 'شو في عند الشركة؟', lang: 'ar', org: true, name: null },
  { text: 'المحل عامل ايه', lang: 'ar', org: true, name: null },
  { text: 'كيف الشغل اليوم؟', lang: 'ar', org: true, name: null },
  { text: 'ما أحوال مطعم السلام', lang: 'ar', org: true, name: 'مطعم السلام' },
  { text: 'ايه اخبارك', lang: 'ar', org: false },
  { text: 'كيف حالك؟', lang: 'ar', org: false },
  { text: 'العيادة تفتح امتى؟', lang: 'ar', org: false },
  { text: 'شو في جديد؟', lang: 'ar', org: false },
  // ---- French
  { text: 'Comment ça se passe chez Nile Dental ?', lang: 'fr', org: true, name: 'nile dental' },
  { text: 'comment va la clinique aujourd’hui', lang: 'fr', org: true, name: null },
  { text: 'quoi de neuf à la boutique ?', lang: 'fr', org: true, name: null },
  { text: 'où en est Acme cette semaine', lang: 'fr', org: true, name: 'acme' },
  { text: 'comment vont les affaires ?', lang: 'fr', org: true, name: null },
  { text: 'comment ça va ?', lang: 'fr', org: false },
  { text: 'quoi de neuf ?', lang: 'fr', org: false },
  { text: 'la boutique ouvre à quelle heure ?', lang: 'fr', org: false },
  { text: 'comment ajouter mon entreprise', lang: 'fr', org: false },
  // ---- Turkish
  { text: 'Klinikte işler nasıl?', lang: 'tr', org: true, name: null },
  { text: "Nile Dental'da durum nasıl", lang: 'tr', org: true, name: 'nile dental' },
  { text: 'şirket nasıl gidiyor bugün', lang: 'tr', org: true, name: null },
  { text: "Acme'de neler oluyor?", lang: 'tr', org: true, name: 'acme' },
  { text: 'işler nasıl?', lang: 'tr', org: true, name: null },
  { text: 'nasılsın?', lang: 'tr', org: false },
  { text: 'ne var ne yok', lang: 'tr', org: false },
  { text: 'dükkan kaçta açılıyor?', lang: 'tr', org: false },
  { text: 'şirketimi nasıl eklerim', lang: 'tr', org: false },
];
