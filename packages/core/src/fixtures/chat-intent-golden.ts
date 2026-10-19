import type { AboutIntent, ChatIntent } from '../chat-intent';

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
/**
 * Questions about one person, as people write them to Cai (G11), labelled by hand with what the
 * rules should read: the question and the name as typed, or null for anything that isn't one
 * person's (a question about everyone, about oneself, or not a question). Written before the
 * rules were measured on them; `chat-intent-golden.test.ts` holds each language to its floor.
 */
export interface AboutLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  about: { intent: AboutIntent; name: string } | null;
}

export const ABOUT_GOLDEN: AboutLine[] = [
  // ---- English
  {
    text: 'what am I still waiting for from Maya?',
    lang: 'en',
    about: { intent: 'waiting', name: 'Maya' },
  },
  { text: 'what does Leo owe me?', lang: 'en', about: { intent: 'waiting', name: 'Leo' } },
  {
    text: "anything I'm waiting on from Priya",
    lang: 'en',
    about: { intent: 'waiting', name: 'Priya' },
  },
  { text: 'what did Maya ask me for?', lang: 'en', about: { intent: 'asked', name: 'Maya' } },
  { text: 'what does Leo need from me?', lang: 'en', about: { intent: 'asked', name: 'Leo' } },
  {
    text: 'is Priya waiting on me for anything?',
    lang: 'en',
    about: { intent: 'asked', name: 'Priya' },
  },
  { text: 'what did I promise Maya?', lang: 'en', about: { intent: 'mine', name: 'Maya' } },
  { text: 'what do I owe Leo?', lang: 'en', about: { intent: 'mine', name: 'Leo' } },
  {
    text: "what did I say I'd do for Priya?",
    lang: 'en',
    about: { intent: 'mine', name: 'Priya' },
  },
  { text: 'when am I seeing Maya?', lang: 'en', about: { intent: 'coming', name: 'Maya' } },
  { text: "when's my next call with Leo?", lang: 'en', about: { intent: 'coming', name: 'Leo' } },
  { text: "what's coming up with Priya?", lang: 'en', about: { intent: 'coming', name: 'Priya' } },
  { text: 'what did Maya and I agree on?', lang: 'en', about: { intent: 'agreed', name: 'Maya' } },
  { text: 'what did we decide with Leo?', lang: 'en', about: { intent: 'agreed', name: 'Leo' } },
  {
    text: 'what have I agreed with Priya?',
    lang: 'en',
    about: { intent: 'agreed', name: 'Priya' },
  },
  { text: 'did Maya pay me?', lang: 'en', about: { intent: 'paid', name: 'Maya' } },
  { text: 'has Leo paid yet?', lang: 'en', about: { intent: 'paid', name: 'Leo' } },
  { text: 'did Priya pay back?', lang: 'en', about: { intent: 'paid', name: 'Priya' } },
  { text: 'What am I waiting for?', lang: 'en', about: null },
  { text: 'did you pay?', lang: 'en', about: null },
  { text: 'when am I seeing everyone?', lang: 'en', about: null },
  { text: 'Maya says hi', lang: 'en', about: null },

  // ---- Arabic
  { text: 'مستني ايه من ريم؟', lang: 'ar', about: { intent: 'waiting', name: 'ريم' } },
  { text: 'شو ناطر من سامي؟', lang: 'ar', about: { intent: 'waiting', name: 'سامي' } },
  { text: 'ماذا أنتظر من ليلى؟', lang: 'ar', about: { intent: 'waiting', name: 'ليلى' } },
  { text: 'ريم طلبت مني ايه؟', lang: 'ar', about: { intent: 'asked', name: 'ريم' } },
  { text: 'سامي عايز مني ايه؟', lang: 'ar', about: { intent: 'asked', name: 'سامي' } },
  { text: 'ماذا طلب مني يوسف؟', lang: 'ar', about: { intent: 'asked', name: 'يوسف' } },
  { text: 'وعدت ريم بايه؟', lang: 'ar', about: { intent: 'mine', name: 'ريم' } },
  { text: 'شو وعدت سامي؟', lang: 'ar', about: { intent: 'mine', name: 'سامي' } },
  { text: 'بماذا وعدت ليلى؟', lang: 'ar', about: { intent: 'mine', name: 'ليلى' } },
  { text: 'امتى هشوف ريم؟', lang: 'ar', about: { intent: 'coming', name: 'ريم' } },
  { text: 'إيمتى بشوف سامي؟', lang: 'ar', about: { intent: 'coming', name: 'سامي' } },
  { text: 'متى موعدي مع ليلى؟', lang: 'ar', about: { intent: 'coming', name: 'ليلى' } },
  { text: 'اتفقنا على ايه انا وريم؟', lang: 'ar', about: { intent: 'agreed', name: 'ريم' } },
  { text: 'شو قررنا مع سامي؟', lang: 'ar', about: { intent: 'agreed', name: 'سامي' } },
  { text: 'ايه اللي اتفقنا عليه مع ليلى؟', lang: 'ar', about: { intent: 'agreed', name: 'ليلى' } },
  { text: 'ريم دفعت؟', lang: 'ar', about: { intent: 'paid', name: 'ريم' } },
  { text: 'هل حول سامي الفلوس؟', lang: 'ar', about: { intent: 'paid', name: 'سامي' } },
  { text: 'ليلى سددت ولا لأ؟', lang: 'ar', about: { intent: 'paid', name: 'ليلى' } },
  { text: 'مستني ايه؟', lang: 'ar', about: null },
  { text: 'دفعت؟', lang: 'ar', about: null },
  { text: 'امتى هشوف الناس؟', lang: 'ar', about: null },
  { text: 'ريم بتسلم عليك', lang: 'ar', about: null },

  // ---- French
  {
    text: "qu'est-ce que j'attends encore de Chloé ?",
    lang: 'fr',
    about: { intent: 'waiting', name: 'Chloé' },
  },
  { text: 'j’attends quoi de Paul ?', lang: 'fr', about: { intent: 'waiting', name: 'Paul' } },
  {
    text: "qu'est-ce que Nadia me doit ?",
    lang: 'fr',
    about: { intent: 'waiting', name: 'Nadia' },
  },
  {
    text: "qu'est-ce que Chloé m'a demandé ?",
    lang: 'fr',
    about: { intent: 'asked', name: 'Chloé' },
  },
  { text: "Paul m'a demandé quoi ?", lang: 'fr', about: { intent: 'asked', name: 'Paul' } },
  {
    text: "qu'est-ce que Nadia attend de moi ?",
    lang: 'fr',
    about: { intent: 'asked', name: 'Nadia' },
  },
  {
    text: "qu'est-ce que j'ai promis à Chloé ?",
    lang: 'fr',
    about: { intent: 'mine', name: 'Chloé' },
  },
  { text: "qu'est-ce que je dois à Paul ?", lang: 'fr', about: { intent: 'mine', name: 'Paul' } },
  { text: "j'ai promis quoi à Nadia ?", lang: 'fr', about: { intent: 'mine', name: 'Nadia' } },
  {
    text: 'quand est-ce que je vois Chloé ?',
    lang: 'fr',
    about: { intent: 'coming', name: 'Chloé' },
  },
  {
    text: "c'est quand mon prochain rdv avec Paul ?",
    lang: 'fr',
    about: { intent: 'coming', name: 'Paul' },
  },
  { text: 'je vois Nadia quand ?', lang: 'fr', about: { intent: 'coming', name: 'Nadia' } },
  {
    text: "qu'est-ce qu'on a décidé avec Chloé ?",
    lang: 'fr',
    about: { intent: 'agreed', name: 'Chloé' },
  },
  {
    text: "on s'est mis d'accord sur quoi avec Paul ?",
    lang: 'fr',
    about: { intent: 'agreed', name: 'Paul' },
  },
  {
    text: "qu'est-ce que j'ai convenu avec Nadia ?",
    lang: 'fr',
    about: { intent: 'agreed', name: 'Nadia' },
  },
  { text: 'Chloé a payé ?', lang: 'fr', about: { intent: 'paid', name: 'Chloé' } },
  { text: "est-ce que Paul m'a payé ?", lang: 'fr', about: { intent: 'paid', name: 'Paul' } },
  { text: 'Nadia a-t-elle payé ?', lang: 'fr', about: { intent: 'paid', name: 'Nadia' } },
  { text: "qu'est-ce que j'attends ?", lang: 'fr', about: null },
  { text: 'tu as payé ?', lang: 'fr', about: null },
  { text: 'Chloé te dit bonjour', lang: 'fr', about: null },

  // ---- Turkish
  { text: "Zeynep'ten ne bekliyorum?", lang: 'tr', about: { intent: 'waiting', name: 'Zeynep' } },
  { text: "Emre'den neyi bekliyorum?", lang: 'tr', about: { intent: 'waiting', name: 'Emre' } },
  { text: 'Selin bana ne borçlu?', lang: 'tr', about: { intent: 'waiting', name: 'Selin' } },
  { text: 'Zeynep benden ne istedi?', lang: 'tr', about: { intent: 'asked', name: 'Zeynep' } },
  { text: 'Emre benden ne istiyor?', lang: 'tr', about: { intent: 'asked', name: 'Emre' } },
  { text: 'Selin benden ne bekliyor?', lang: 'tr', about: { intent: 'asked', name: 'Selin' } },
  { text: "Zeynep'e ne söz verdim?", lang: 'tr', about: { intent: 'mine', name: 'Zeynep' } },
  { text: "Emre'ye ne söz verdim?", lang: 'tr', about: { intent: 'mine', name: 'Emre' } },
  { text: "Selin'e ne borçluyum?", lang: 'tr', about: { intent: 'mine', name: 'Selin' } },
  {
    text: 'Zeynep ile ne zaman görüşüyorum?',
    lang: 'tr',
    about: { intent: 'coming', name: 'Zeynep' },
  },
  { text: 'Emre ile ne zaman buluşacağım?', lang: 'tr', about: { intent: 'coming', name: 'Emre' } },
  {
    text: "Selin'le ne zaman görüşeceğim?",
    lang: 'tr',
    about: { intent: 'coming', name: 'Selin' },
  },
  { text: 'Zeynep ile ne karar verdik?', lang: 'tr', about: { intent: 'agreed', name: 'Zeynep' } },
  { text: 'Emre ile neye anlaştık?', lang: 'tr', about: { intent: 'agreed', name: 'Emre' } },
  { text: "Selin'le neye karar verdik?", lang: 'tr', about: { intent: 'agreed', name: 'Selin' } },
  { text: 'Zeynep ödedi mi?', lang: 'tr', about: { intent: 'paid', name: 'Zeynep' } },
  { text: 'Emre ödemeyi yaptı mı?', lang: 'tr', about: { intent: 'paid', name: 'Emre' } },
  { text: 'Selin parayı gönderdi mi?', lang: 'tr', about: { intent: 'paid', name: 'Selin' } },
  { text: 'ne bekliyorum?', lang: 'tr', about: null },
  { text: 'ödedin mi?', lang: 'tr', about: null },
  { text: 'Zeynep selam söylüyor', lang: 'tr', about: null },

  // ---- Added once the rules first met the server (2026-10-19), written before they were tried:
  // a day where a name would be, a name after "to" or "@", a day after the name, and the
  // relationship someone is named by ("my dentist", "مديري"), which `aboutRelationship` reads.
  { text: 'what did I promise yesterday?', lang: 'en', about: null },
  { text: 'what did I promise today?', lang: 'en', about: null },
  { text: 'what did I promise Ana yesterday?', lang: 'en', about: { intent: 'mine', name: 'Ana' } },
  { text: 'what did I promise to Ana?', lang: 'en', about: { intent: 'mine', name: 'Ana' } },
  {
    text: 'what am I waiting for from @ana?',
    lang: 'en',
    about: { intent: 'waiting', name: 'ana' },
  },
  {
    text: 'when am I seeing my dentist?',
    lang: 'en',
    about: { intent: 'coming', name: 'my dentist' },
  },
  {
    text: 'what am I waiting for from my manager?',
    lang: 'en',
    about: { intent: 'waiting', name: 'my manager' },
  },
  { text: 'did the client pay?', lang: 'en', about: { intent: 'paid', name: 'the client' } },
  { text: 'ايه اللي وعدت بيه امبارح؟', lang: 'ar', about: null },
  { text: 'مستني ايه من مديري؟', lang: 'ar', about: { intent: 'waiting', name: 'مديري' } },
  { text: 'هل دفع العميل؟', lang: 'ar', about: { intent: 'paid', name: 'العميل' } },
  { text: 'امتى هشوف الدكتور؟', lang: 'ar', about: { intent: 'coming', name: 'الدكتور' } },
  { text: 'وعدت أحمد بإيه امبارح؟', lang: 'ar', about: { intent: 'mine', name: 'أحمد' } },
  { text: 'منى دفعت امبارح؟', lang: 'ar', about: { intent: 'paid', name: 'منى' } },
  { text: "qu'est-ce que j'ai promis hier ?", lang: 'fr', about: null },
  {
    text: "qu'est-ce que j'attends de mon frère ?",
    lang: 'fr',
    about: { intent: 'waiting', name: 'mon frère' },
  },
  {
    text: 'quand est-ce que je vois le médecin ?',
    lang: 'fr',
    about: { intent: 'coming', name: 'le médecin' },
  },
  { text: 'Karim a payé hier ?', lang: 'fr', about: { intent: 'paid', name: 'Karim' } },
  {
    text: "qu'est-ce que j'ai promis à Léa aujourd'hui ?",
    lang: 'fr',
    about: { intent: 'mine', name: 'Léa' },
  },
  { text: 'bugün ne söz verdim?', lang: 'tr', about: null },
  { text: 'annem ödedi mi?', lang: 'tr', about: { intent: 'paid', name: 'annem' } },
  { text: 'patronum benden ne istedi?', lang: 'tr', about: { intent: 'asked', name: 'patronum' } },
  {
    text: 'doktor ile ne zaman görüşüyorum?',
    lang: 'tr',
    about: { intent: 'coming', name: 'doktor' },
  },
  { text: 'Murat dün ödedi mi?', lang: 'tr', about: { intent: 'paid', name: 'Murat' } },
];

/**
 * The relationship a question names someone by, in place of their name (G11): "my dentist",
 * "مديري" (my manager), "mon patron", "annem" (my mother), labelled by hand as the person's own
 * relationships are kept (a sphere, and a role where the words say one), or null for a name or a
 * thing. Each is read in its own reader's language, where a relationship's label is its word.
 * Written before `aboutRelationship` was measured on them.
 */
export interface RelationLine {
  words: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  relationship: { sphere?: string; role?: string } | null;
}

export const RELATION_GOLDEN: RelationLine[] = [
  { words: 'my dentist', lang: 'en', relationship: { role: 'dentist' } },
  { words: 'my manager', lang: 'en', relationship: { sphere: 'work', role: 'manager' } },
  { words: 'my boss', lang: 'en', relationship: { sphere: 'work', role: 'manager' } },
  { words: 'the client', lang: 'en', relationship: { sphere: 'customer' } },
  { words: 'my landlord', lang: 'en', relationship: { role: 'landlord' } },
  { words: 'my mom', lang: 'en', relationship: { sphere: 'family', role: 'mother' } },
  { words: 'my brother', lang: 'en', relationship: { sphere: 'family', role: 'brother' } },
  { words: 'my lawyer', lang: 'en', relationship: { role: 'lawyer' } },
  { words: 'Ana', lang: 'en', relationship: null },
  { words: 'my car', lang: 'en', relationship: null },
  { words: 'مديري', lang: 'ar', relationship: { sphere: 'work', role: 'manager' } },
  { words: 'العميل', lang: 'ar', relationship: { sphere: 'customer' } },
  { words: 'الدكتور', lang: 'ar', relationship: { role: 'doctor' } },
  { words: 'ماما', lang: 'ar', relationship: { sphere: 'family', role: 'mother' } },
  { words: 'أخويا', lang: 'ar', relationship: { sphere: 'family', role: 'brother' } },
  { words: 'صاحبي', lang: 'ar', relationship: { sphere: 'friend' } },
  { words: 'المحامي', lang: 'ar', relationship: { role: 'lawyer' } },
  { words: 'سارة', lang: 'ar', relationship: null },
  { words: 'السيارة', lang: 'ar', relationship: null },
  { words: 'mon frère', lang: 'fr', relationship: { sphere: 'family', role: 'brother' } },
  { words: 'le médecin', lang: 'fr', relationship: { role: 'doctor' } },
  { words: 'mon patron', lang: 'fr', relationship: { sphere: 'work', role: 'manager' } },
  { words: 'ma mère', lang: 'fr', relationship: { sphere: 'family', role: 'mother' } },
  { words: 'le client', lang: 'fr', relationship: { sphere: 'customer' } },
  { words: 'mon avocat', lang: 'fr', relationship: { role: 'lawyer' } },
  { words: 'Léa', lang: 'fr', relationship: null },
  { words: 'ma voiture', lang: 'fr', relationship: null },
  { words: 'annem', lang: 'tr', relationship: { sphere: 'family', role: 'mother' } },
  { words: 'patronum', lang: 'tr', relationship: { sphere: 'work', role: 'manager' } },
  { words: 'doktor', lang: 'tr', relationship: { role: 'doctor' } },
  { words: 'müşterim', lang: 'tr', relationship: { sphere: 'customer' } },
  { words: 'ev sahibim', lang: 'tr', relationship: { role: 'landlord' } },
  { words: 'avukatım', lang: 'tr', relationship: { role: 'lawyer' } },
  { words: 'Zeynep', lang: 'tr', relationship: null },
  { words: 'arabam', lang: 'tr', relationship: null },
];
