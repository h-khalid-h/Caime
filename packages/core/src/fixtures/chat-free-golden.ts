/**
 * What people write to Cai about their own free time (M17 I7), labelled by hand: `free` when the
 * message asks when its writer is free or whether they are, false for everything near it that
 * isn't (Cai asked about itself, someone else's time, a statement, a price that's "free", the four
 * questions about open things). Written before the rules were measured on them;
 * `chat-free-golden.test.ts` holds every language to all of its lines.
 */
export interface FreeLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  free: boolean;
}

export const CHAT_FREE_GOLDEN: FreeLine[] = [
  // ---- English
  { text: 'when am I free Thursday?', lang: 'en', free: true },
  { text: 'When am I free tomorrow', lang: 'en', free: true },
  { text: 'am i free at 3 tomorrow?', lang: 'en', free: true },
  { text: 'Am I busy on Friday afternoon?', lang: 'en', free: true },
  { text: 'what does my Thursday look like', lang: 'en', free: true },
  { text: "what's my day look like tomorrow?", lang: 'en', free: true },
  { text: 'do I have time tomorrow?', lang: 'en', free: true },
  { text: 'Do I have any free time on Monday', lang: 'en', free: true },
  { text: 'is my afternoon free?', lang: 'en', free: true },
  { text: 'when can I fit a call with Omar', lang: 'en', free: true },
  { text: 'are you free?', lang: 'en', free: false },
  { text: 'when is Sara free?', lang: 'en', free: false },
  { text: "I'm free tomorrow", lang: 'en', free: false },
  { text: 'is the parking free on Sundays?', lang: 'en', free: false },
  { text: 'feel free to call me', lang: 'en', free: false },
  { text: 'Do I have anything today?', lang: 'en', free: false },
  { text: "what's on this week", lang: 'en', free: false },
  // ---- Arabic, Standard and spoken
  { text: 'امتى أنا فاضي الخميس؟', lang: 'ar', free: true },
  { text: 'إمتى فاضي بكرة', lang: 'ar', free: true },
  { text: 'متى فاضي باجر؟', lang: 'ar', free: true },
  { text: 'إيمتى أنا فاضي؟', lang: 'ar', free: true },
  { text: 'هل أنا فاضي بكرة الساعة ٣؟', lang: 'ar', free: true },
  { text: 'فاضية يوم الأحد؟', lang: 'ar', free: true },
  { text: 'عندي وقت بكرة؟', lang: 'ar', free: true },
  { text: 'عندي أي وقت فاضي الأسبوع ده', lang: 'ar', free: true },
  { text: 'امتى يكون عندي وقت أكلم سامي', lang: 'ar', free: true },
  { text: 'شو أوقات فراغي بكرا', lang: 'ar', free: true },
  { text: 'إنت فاضي؟', lang: 'ar', free: false },
  { text: 'أنا فاضي بكرة', lang: 'ar', free: false },
  { text: 'هو فاضي امتى؟', lang: 'ar', free: false },
  { text: 'الشحن مجاني؟', lang: 'ar', free: false },
  { text: 'ايه اللي جاي الأسبوع ده', lang: 'ar', free: false },
  // ---- French
  { text: 'quand est-ce que je suis libre jeudi ?', lang: 'fr', free: true },
  { text: 'Quand suis-je disponible demain', lang: 'fr', free: true },
  { text: 'je suis dispo demain à 15h ?', lang: 'fr', free: true },
  { text: 'suis-je libre vendredi après-midi ?', lang: 'fr', free: true },
  { text: 'quelles sont mes disponibilités lundi', lang: 'fr', free: true },
  { text: "j'ai du temps demain ?", lang: 'fr', free: true },
  { text: 'tu es libre ce soir ?', lang: 'fr', free: false },
  { text: 'je suis libre demain', lang: 'fr', free: false },
  { text: "l'entrée est libre ?", lang: 'fr', free: false },
  { text: "qu'est-ce qui m'attend cette semaine", lang: 'fr', free: false },
  // ---- Turkish
  { text: 'perşembe ne zaman boşum?', lang: 'tr', free: true },
  { text: 'Yarın müsait miyim?', lang: 'tr', free: true },
  { text: 'ne zaman müsaitim', lang: 'tr', free: true },
  { text: 'cuma boş muyum', lang: 'tr', free: true },
  { text: 'yarın boş vaktim var mı?', lang: 'tr', free: true },
  { text: 'sen boş musun?', lang: 'tr', free: false },
  { text: 'yarın boşum', lang: 'tr', free: false },
  { text: 'giriş ücretsiz mi?', lang: 'tr', free: false },
  { text: 'bu hafta ne var', lang: 'tr', free: false },
];
