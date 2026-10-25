import type { ActKind } from '../chat-act';

/**
 * What people write to Cai or a friend when they want something done for them in Caime (M16
 * G14), labelled by hand before the rules met them: a message to one of their people and its
 * words, a call (with video or not), a meeting and the time said for it, something to find, or
 * null. The near-misses are here on purpose, since an act read wrongly puts a draft or a call in
 * front of someone: a sentence that tells of a call ("I called Sami yesterday"), "tell me a joke",
 * "call me later", a reminder to call ("remind me to call Sami tomorrow", which is a reminder),
 * "ask Sami if he's coming" (whose "he" the rules can't turn into "you").
 * `chat-act-golden.test.ts` holds each language to them.
 */
export interface ActLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  act: {
    kind: ActKind;
    who: string | null;
    words: string | null;
    title?: string;
    video?: boolean;
    /** A move's meeting as named (its time or its name), whom it's with apart (M17 I7). */
    from?: string | null;
  } | null;
}
export const ACT_GOLDEN: ActLine[] = [
  // ---- English
  { text: 'call Sami', lang: 'en', act: { kind: 'call', who: 'Sami', words: null } },
  {
    text: 'Can you call Maya please?',
    lang: 'en',
    act: { kind: 'call', who: 'Maya', words: null },
  },
  {
    text: 'video call Leila',
    lang: 'en',
    act: { kind: 'call', who: 'Leila', words: null, video: true },
  },
  { text: 'give Omar a call', lang: 'en', act: { kind: 'call', who: 'Omar', words: null } },
  {
    text: "tell Sami I'll be ten minutes late",
    lang: 'en',
    act: { kind: 'message', who: 'Sami', words: "I'll be ten minutes late" },
  },
  {
    text: 'text Maya that the venue is booked',
    lang: 'en',
    act: { kind: 'message', who: 'Maya', words: 'the venue is booked' },
  },
  {
    text: 'message Omar: see you at 5',
    lang: 'en',
    act: { kind: 'message', who: 'Omar', words: 'see you at 5' },
  },
  {
    text: 'let Leila know the report is ready',
    lang: 'en',
    act: { kind: 'message', who: 'Leila', words: 'the report is ready' },
  },
  {
    text: 'set up a meeting with Sami tomorrow at 3',
    lang: 'en',
    act: { kind: 'meeting', who: 'Sami', words: 'tomorrow at 3' },
  },
  {
    text: 'schedule a call with Maya on Thursday at 10am',
    lang: 'en',
    act: { kind: 'meeting', who: 'Maya', words: 'on Thursday at 10am' },
  },
  {
    text: 'book a meeting with Omar',
    lang: 'en',
    act: { kind: 'meeting', who: 'Omar', words: null },
  },
  {
    text: 'find the contract Ana sent',
    lang: 'en',
    act: { kind: 'find', who: null, words: 'the contract Ana sent' },
  },
  {
    text: "where's the invoice from Nile Dental?",
    lang: 'en',
    act: { kind: 'find', who: null, words: 'the invoice from Nile Dental' },
  },
  {
    text: 'look for the photos from the offsite',
    lang: 'en',
    act: { kind: 'find', who: null, words: 'the photos from the offsite' },
  },
  { text: 'I called Sami yesterday', lang: 'en', act: null },
  { text: 'did Sami call?', lang: 'en', act: null },
  { text: 'call me later', lang: 'en', act: null },
  { text: 'tell me a joke', lang: 'en', act: null },
  { text: 'tell me about the meeting', lang: 'en', act: null },
  { text: 'what should I tell Sami?', lang: 'en', act: null },
  { text: 'Sami will call you', lang: 'en', act: null },
  { text: 'remind me to call Sami tomorrow', lang: 'en', act: null },
  {
    text: 'tell Sara to call me',
    lang: 'en',
    act: { kind: 'message', who: 'Sara', words: 'Could you call me?' },
  },
  {
    text: 'ask Omar to send me the invoice by Friday',
    lang: 'en',
    act: { kind: 'message', who: 'Omar', words: 'Could you send me the invoice by Friday?' },
  },
  {
    text: "text my boss I'm running late",
    lang: 'en',
    act: { kind: 'message', who: 'my boss', words: "I'm running late" },
  },
  { text: 'text Maya', lang: 'en', act: { kind: 'message', who: 'Maya', words: null } },
  {
    text: 'tell Sami I’ll be there at 5',
    lang: 'en',
    act: { kind: 'message', who: 'Sami', words: 'I’ll be there at 5' },
  },
  {
    text: 'set up a meeting with Sami about the budget tomorrow at 3',
    lang: 'en',
    act: { kind: 'meeting', who: 'Sami', words: 'tomorrow at 3', title: 'the budget' },
  },
  { text: 'find me a good restaurant', lang: 'en', act: null },
  { text: "ask Sami if he's coming", lang: 'en', act: null },
  { text: 'send Sami the file', lang: 'en', act: null },

  {
    text: 'move my 3pm to tomorrow',
    lang: 'en',
    act: { kind: 'move', who: null, words: 'tomorrow', from: '3pm' },
  },
  {
    text: 'Can you reschedule my meeting with Sami to Thursday at 4?',
    lang: 'en',
    act: { kind: 'move', who: 'Sami', words: 'Thursday at 4', from: null },
  },
  {
    text: "push my 3 o'clock back to 5",
    lang: 'en',
    act: { kind: 'move', who: null, words: '5', from: "3 o'clock" },
  },
  {
    text: 'postpone the budget review to next week',
    lang: 'en',
    act: { kind: 'move', who: null, words: 'next week', from: 'budget review' },
  },
  {
    text: "move tomorrow's 10am to Friday",
    lang: 'en',
    act: { kind: 'move', who: null, words: 'Friday', from: 'tomorrow 10am' },
  },
  {
    text: 'reschedule my call with Leila',
    lang: 'en',
    act: { kind: 'move', who: 'Leila', words: null, from: null },
  },
  { text: 'move the car to the garage', lang: 'en', act: null },
  { text: 'change my password', lang: 'en', act: null },
  { text: 'change the meeting notes', lang: 'en', act: null },
  { text: 'I moved my 3pm to tomorrow', lang: 'en', act: null },
  { text: 'push the update to production', lang: 'en', act: null },
  // ---- Arabic
  { text: 'اتصل بسامي', lang: 'ar', act: { kind: 'call', who: 'سامي', words: null } },
  { text: 'كلم ريم', lang: 'ar', act: { kind: 'call', who: 'ريم', words: null } },
  { text: 'ممكن ترن على ليلى؟', lang: 'ar', act: { kind: 'call', who: 'ليلى', words: null } },
  {
    text: 'اعمل مكالمة فيديو مع عمر',
    lang: 'ar',
    act: { kind: 'call', who: 'عمر', words: null, video: true },
  },
  {
    text: 'قول لسامي إني هتأخر عشر دقايق',
    lang: 'ar',
    act: { kind: 'message', who: 'سامي', words: 'هتأخر عشر دقايق' },
  },
  {
    text: 'ابعت لريم إن القاعة اتحجزت',
    lang: 'ar',
    act: { kind: 'message', who: 'ريم', words: 'القاعة اتحجزت' },
  },
  {
    text: 'بلغ ليلى أن التقرير جاهز',
    lang: 'ar',
    act: { kind: 'message', who: 'ليلى', words: 'التقرير جاهز' },
  },
  {
    text: 'حدد اجتماع مع سامي بكرة الساعة 3',
    lang: 'ar',
    act: { kind: 'meeting', who: 'سامي', words: 'بكرة الساعة 3' },
  },
  { text: 'رتب لي موعد مع ريم', lang: 'ar', act: { kind: 'meeting', who: 'ريم', words: null } },
  {
    text: 'دور على العقد اللي بعته أنس',
    lang: 'ar',
    act: { kind: 'find', who: null, words: 'العقد اللي بعته أنس' },
  },
  {
    text: 'ابحث عن فاتورة العيادة',
    lang: 'ar',
    act: { kind: 'find', who: null, words: 'فاتورة العيادة' },
  },
  { text: 'اتصلت بسامي امبارح', lang: 'ar', act: null },
  { text: 'سامي اتصل؟', lang: 'ar', act: null },
  { text: 'قولي نكتة', lang: 'ar', act: null },
  { text: 'ذكرني اتصل بسامي بكرة', lang: 'ar', act: null },
  {
    text: 'قول لسامي إن شاء الله جاي',
    lang: 'ar',
    act: { kind: 'message', who: 'سامي', words: 'إن شاء الله جاي' },
  },
  { text: 'كلم مديري', lang: 'ar', act: { kind: 'call', who: 'مديري', words: null } },
  {
    text: 'قول لريم إني جايّ حالًا',
    lang: 'ar',
    act: { kind: 'message', who: 'ريم', words: 'جايّ حالًا' },
  },
  { text: 'ابعتلي الملف', lang: 'ar', act: null },

  {
    text: 'أجّل اجتماعي مع سامي لبكرة',
    lang: 'ar',
    act: { kind: 'move', who: 'سامي', words: 'بكرة', from: null },
  },
  {
    text: 'انقل موعد الساعة 3 ليوم الخميس',
    lang: 'ar',
    act: { kind: 'move', who: null, words: 'يوم الخميس', from: 'الساعة 3' },
  },
  {
    text: 'ممكن تأجل الاجتماع مع ليلى للأسبوع الجاي',
    lang: 'ar',
    act: { kind: 'move', who: 'ليلى', words: 'الأسبوع الجاي', from: null },
  },
  {
    text: 'غير معاد الاجتماع مع سامي للساعة 5',
    lang: 'ar',
    act: { kind: 'move', who: 'سامي', words: 'الساعة 5', from: null },
  },
  { text: 'أجلت الاجتماع لبكرة', lang: 'ar', act: null },
  { text: 'انقل الملف لسامي', lang: 'ar', act: null },
  { text: 'غير رأيك', lang: 'ar', act: null },
  // ---- French
  { text: 'appelle Sami', lang: 'fr', act: { kind: 'call', who: 'Sami', words: null } },
  {
    text: 'lance un appel vidéo avec Léa',
    lang: 'fr',
    act: { kind: 'call', who: 'Léa', words: null, video: true },
  },
  {
    text: "dis à Sami que j'aurai dix minutes de retard",
    lang: 'fr',
    act: { kind: 'message', who: 'Sami', words: "j'aurai dix minutes de retard" },
  },
  {
    text: 'écris à Léa : la salle est réservée',
    lang: 'fr',
    act: { kind: 'message', who: 'Léa', words: 'la salle est réservée' },
  },
  {
    text: 'planifie une réunion avec Omar demain à 15h',
    lang: 'fr',
    act: { kind: 'meeting', who: 'Omar', words: 'demain à 15h' },
  },
  {
    text: 'trouve le contrat envoyé par Ana',
    lang: 'fr',
    act: { kind: 'find', who: null, words: 'le contrat envoyé par Ana' },
  },
  { text: "j'ai appelé Sami hier", lang: 'fr', act: null },
  { text: 'dis-moi une blague', lang: 'fr', act: null },
  { text: 'rappelle-moi d’appeler Sami demain', lang: 'fr', act: null },
  {
    text: "dis à Sami de m'appeler",
    lang: 'fr',
    act: { kind: 'message', who: 'Sami', words: "Tu peux m'appeler ?" },
  },
  {
    text: "demande à Léa d'apporter le gâteau",
    lang: 'fr',
    act: { kind: 'message', who: 'Léa', words: 'Tu peux apporter le gâteau ?' },
  },

  {
    text: 'déplace mon rdv de 15h à demain',
    lang: 'fr',
    act: { kind: 'move', who: null, words: 'demain', from: '15h' },
  },
  {
    text: 'reporte ma réunion avec Sami à jeudi 16h',
    lang: 'fr',
    act: { kind: 'move', who: 'Sami', words: 'jeudi 16h', from: null },
  },
  {
    text: 'tu peux décaler mon appel de 10h à 11h ?',
    lang: 'fr',
    act: { kind: 'move', who: null, words: '11h', from: '10h' },
  },
  { text: "j'ai décalé la réunion à demain", lang: 'fr', act: null },
  { text: 'déplace le fichier dans le dossier', lang: 'fr', act: null },
  { text: 'change le mot de passe', lang: 'fr', act: null },
  // ---- Turkish
  { text: "Sami'yi ara", lang: 'tr', act: { kind: 'call', who: 'Sami', words: null } },
  {
    text: "Ayşe'yi görüntülü ara",
    lang: 'tr',
    act: { kind: 'call', who: 'Ayşe', words: null, video: true },
  },
  {
    text: "Sami'ye yaz: on dakika gecikeceğim",
    lang: 'tr',
    act: { kind: 'message', who: 'Sami', words: 'on dakika gecikeceğim' },
  },
  {
    text: "Mehmet'e mesaj at salon ayarlandı",
    lang: 'tr',
    act: { kind: 'message', who: 'Mehmet', words: 'salon ayarlandı' },
  },
  {
    text: 'Sami ile yarın saat 3te toplantı ayarla',
    lang: 'tr',
    act: { kind: 'meeting', who: 'Sami', words: 'yarın saat 3te' },
  },
  {
    text: "Ayşe'nin gönderdiği sözleşmeyi bul",
    lang: 'tr',
    act: { kind: 'find', who: null, words: "Ayşe'nin gönderdiği sözleşmeyi" },
  },
  { text: "Sami'yi aradım", lang: 'tr', act: null },
  { text: 'Sami aradı mı?', lang: 'tr', act: null },
  { text: "yarın Sami'yi aramayı hatırlat", lang: 'tr', act: null },
  { text: "Mehmet'i ara lütfen", lang: 'tr', act: { kind: 'call', who: 'Mehmet', words: null } },
  {
    text: '15:00 toplantımı yarına al',
    lang: 'tr',
    act: { kind: 'move', who: null, words: 'yarın', from: '15:00' },
  },
  {
    text: 'Sami ile toplantımı perşembeye ertele',
    lang: 'tr',
    act: { kind: 'move', who: 'Sami', words: 'perşembe', from: null },
  },
  {
    text: "saat 3'teki randevumu cumaya taşı",
    lang: 'tr',
    act: { kind: 'move', who: null, words: 'cuma', from: 'saat 3' },
  },
  { text: 'toplantıyı yarına erteledim', lang: 'tr', act: null },
  { text: 'dosyayı klasöre taşı', lang: 'tr', act: null },
  { text: 'doktordan randevu al', lang: 'tr', act: null },
];
