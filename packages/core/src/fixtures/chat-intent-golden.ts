import type { ChatIntent } from '../chat-intent';

/**
 * What people write to Cai or a friend, labelled by hand with what the rules should answer
 * (M16 G10, review 2026-10-17 §5 M: "`chatIntent` … unmeasured"): one of the four questions about
 * one's own open things, small talk, or null, the model's. A rule's answer to the wrong question
 * costs more than sending a message to the model, so the near-misses are here on purpose: a
 * greeting with a task in it, someone waiting for a bus, a question about one person (a rule
 * answer would list everyone's). Written before the rules were measured on them;
 * `chat-intent-golden.test.ts` holds each language to floors set at what was measured.
 */
export interface IntentLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  intent: ChatIntent | null;
}

export const CHAT_INTENT_GOLDEN: IntentLine[] = [
  // ---- English
  { text: 'what am i waiting on', lang: 'en', intent: 'waiting' },
  { text: "Anything I'm still waiting for from people?", lang: 'en', intent: 'waiting' },
  { text: "who hasn't got back to me", lang: 'en', intent: 'waiting' },
  { text: 'what do people need from me', lang: 'en', intent: 'asked' },
  { text: 'Is anyone waiting for me to do something?', lang: 'en', intent: 'asked' },
  { text: 'what have I been asked to do', lang: 'en', intent: 'asked' },
  { text: "what did I say I'd do", lang: 'en', intent: 'mine' },
  { text: 'show me my to-dos', lang: 'en', intent: 'mine' },
  { text: 'what are my open promises', lang: 'en', intent: 'mine' },
  { text: "what's on this week", lang: 'en', intent: 'coming' },
  { text: 'Do I have anything today?', lang: 'en', intent: 'coming' },
  { text: "what's next on my calendar", lang: 'en', intent: 'coming' },
  { text: 'hey', lang: 'en', intent: 'greeting' },
  { text: 'Good evening Cai', lang: 'en', intent: 'greeting' },
  { text: 'hello there!', lang: 'en', intent: 'greeting' },
  { text: 'what can you help me with?', lang: 'en', intent: 'help' },
  { text: 'what do you do', lang: 'en', intent: 'help' },
  { text: 'cheers!', lang: 'en', intent: 'thanks' },
  { text: 'thanks a lot, that helps', lang: 'en', intent: 'thanks' },
  { text: "write a reply to Ana saying I'm late", lang: 'en', intent: null },
  { text: 'summarise my week', lang: 'en', intent: null },
  { text: 'what did Ana say about the contract?', lang: 'en', intent: null },
  { text: 'hi, can you draft an email to my landlord?', lang: 'en', intent: null },
  { text: 'thanks, and can you remind me to call Sam tomorrow?', lang: 'en', intent: null },
  { text: "I'm waiting for the bus", lang: 'en', intent: null },
  { text: 'what am I waiting for from Ana?', lang: 'en', intent: null },

  // ---- Arabic
  { text: 'انا مستني ايه من الناس', lang: 'ar', intent: 'waiting' },
  { text: 'إيش اللي أنتظره؟', lang: 'ar', intent: 'waiting' },
  { text: 'شو ناطر؟', lang: 'ar', intent: 'waiting' },
  { text: 'مين مستنيني اعمل حاجة؟', lang: 'ar', intent: 'asked' },
  { text: 'وش المطلوب مني؟', lang: 'ar', intent: 'asked' },
  { text: 'شو طالبين مني', lang: 'ar', intent: 'asked' },
  { text: 'ايه اللي وعدت بيه', lang: 'ar', intent: 'mine' },
  { text: 'مهامي', lang: 'ar', intent: 'mine' },
  { text: 'شو المهام تبعي', lang: 'ar', intent: 'mine' },
  { text: 'عندي ايه الأسبوع ده', lang: 'ar', intent: 'coming' },
  { text: 'وش عندي باكر؟', lang: 'ar', intent: 'coming' },
  { text: 'شو عندي اليوم', lang: 'ar', intent: 'coming' },
  { text: 'صباح الخير', lang: 'ar', intent: 'greeting' },
  { text: 'هلا والله', lang: 'ar', intent: 'greeting' },
  { text: 'مرحبا كاي', lang: 'ar', intent: 'greeting' },
  { text: 'السلام عليكم ورحمة الله', lang: 'ar', intent: 'greeting' },
  { text: 'تقدر تساعدني في ايه؟', lang: 'ar', intent: 'help' },
  { text: 'شو بتقدر تعمل؟', lang: 'ar', intent: 'help' },
  { text: 'شكرا جزيلا', lang: 'ar', intent: 'thanks' },
  { text: 'تسلم يا غالي', lang: 'ar', intent: 'thanks' },
  { text: 'يعطيك العافية', lang: 'ar', intent: 'thanks' },
  { text: 'اكتب رد لأحمد اني هتأخر', lang: 'ar', intent: null },
  { text: 'لخصلي الأسبوع', lang: 'ar', intent: null },
  { text: 'ايه اللي قاله أحمد عن العقد؟', lang: 'ar', intent: null },
  { text: 'صباح الخير، ممكن تكتبلي ايميل؟', lang: 'ar', intent: null },
  { text: 'مستني الأتوبيس', lang: 'ar', intent: null },
  { text: 'مستني ايه من أحمد؟', lang: 'ar', intent: null },

  // ---- French
  { text: "qu'est-ce que j'attends encore ?", lang: 'fr', intent: 'waiting' },
  { text: "j'attends quoi des autres", lang: 'fr', intent: 'waiting' },
  { text: "qui ne m'a pas répondu", lang: 'fr', intent: 'waiting' },
  { text: "qu'est-ce qu'on attend de moi ?", lang: 'fr', intent: 'asked' },
  { text: "on m'a demandé quoi", lang: 'fr', intent: 'asked' },
  { text: "qu'est-ce que j'ai promis ?", lang: 'fr', intent: 'mine' },
  { text: 'ma liste de tâches', lang: 'fr', intent: 'mine' },
  { text: 'mes engagements', lang: 'fr', intent: 'mine' },
  { text: "qu'est-ce que j'ai cette semaine ?", lang: 'fr', intent: 'coming' },
  { text: "c'est quoi mon programme aujourd'hui", lang: 'fr', intent: 'coming' },
  { text: 'quoi de prévu demain ?', lang: 'fr', intent: 'coming' },
  { text: 'salut', lang: 'fr', intent: 'greeting' },
  { text: 'bonsoir Cai', lang: 'fr', intent: 'greeting' },
  { text: 'salam', lang: 'fr', intent: 'greeting' },
  { text: 'tu fais quoi exactement ?', lang: 'fr', intent: 'help' },
  { text: "comment tu peux m'aider ?", lang: 'fr', intent: 'help' },
  { text: 'merci beaucoup', lang: 'fr', intent: 'thanks' },
  { text: 'merci, top', lang: 'fr', intent: 'thanks' },
  { text: 'écris une réponse à Ana', lang: 'fr', intent: null },
  { text: 'résume ma semaine', lang: 'fr', intent: null },
  { text: 'salut, tu peux écrire un mail à mon proprio ?', lang: 'fr', intent: null },
  { text: "j'attends le bus", lang: 'fr', intent: null },
  { text: "qu'est-ce que j'attends de Sarah ?", lang: 'fr', intent: null },

  // ---- Turkish
  { text: 'neyi bekliyorum', lang: 'tr', intent: 'waiting' },
  { text: 'kimden ne bekliyorum?', lang: 'tr', intent: 'waiting' },
  { text: 'bana kim dönmedi', lang: 'tr', intent: 'waiting' },
  { text: 'benden ne istendi?', lang: 'tr', intent: 'asked' },
  { text: 'benden ne bekleniyor', lang: 'tr', intent: 'asked' },
  { text: 'ne söz verdim?', lang: 'tr', intent: 'mine' },
  { text: 'yapılacaklarım', lang: 'tr', intent: 'mine' },
  { text: 'görev listem', lang: 'tr', intent: 'mine' },
  { text: 'bu hafta ne var?', lang: 'tr', intent: 'coming' },
  { text: 'yarın neyim var', lang: 'tr', intent: 'coming' },
  { text: 'bugün programım ne', lang: 'tr', intent: 'coming' },
  { text: 'selam', lang: 'tr', intent: 'greeting' },
  { text: 'günaydın', lang: 'tr', intent: 'greeting' },
  { text: 'iyi akşamlar Cai', lang: 'tr', intent: 'greeting' },
  { text: 'neler yapabilirsin?', lang: 'tr', intent: 'help' },
  { text: 'bana nasıl yardımcı olursun', lang: 'tr', intent: 'help' },
  { text: 'çok teşekkürler', lang: 'tr', intent: 'thanks' },
  { text: 'sağ ol', lang: 'tr', intent: 'thanks' },
  { text: 'eyvallah', lang: 'tr', intent: 'thanks' },
  { text: "Ayşe'ye geç kalacağımı yaz", lang: 'tr', intent: null },
  { text: 'haftamı özetle', lang: 'tr', intent: null },
  { text: 'selam, ev sahibime bir e-posta yazar mısın?', lang: 'tr', intent: null },
  { text: 'otobüsü bekliyorum', lang: 'tr', intent: null },
  { text: "Ayşe'den ne bekliyorum?", lang: 'tr', intent: null },
];
