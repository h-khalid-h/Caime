/**
 * Lines heard in a call, labelled by hand with what calls Cai (M17 I13g, R114 (3)): the name as
 * speech-to-text writes it, then a question or a request, in every interface language and
 * Arabic as Cairo, the Gulf, the Levant and the Maghreb say it; and the near-misses that must
 * not: a person named Kai, "okay so…", a greeting, the name said of someone, a statement after
 * the name. Written apart from the rules; `cai-call-golden.test.ts` holds each language to floors
 * set at what was measured, only ever raised.
 */
export interface CaiCallLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  /** Arabic as a variety writes it; Standard when left out. */
  variety?: 'egyptian' | 'gulf' | 'levantine' | 'maghrebi';
  /** What Cai is asked, or null when it isn't called. */
  question: string | null;
  /** The question asks about what's on a shared screen (M17 I13h): Cai looks before it answers. */
  screen?: true;
}

export const CAI_CALL_GOLDEN: CaiCallLine[] = [
  // ---- English: called
  {
    text: 'Cai, what did we decide on the price?',
    lang: 'en',
    question: 'what did we decide on the price?',
  },
  { text: 'Hey Cai, when is the next meeting?', lang: 'en', question: 'when is the next meeting?' },
  {
    text: 'Kai what did Sam say about the venue',
    lang: 'en',
    question: 'what did Sam say about the venue',
  },
  {
    text: 'Cai, remind me to send the contract tomorrow',
    lang: 'en',
    question: 'remind me to send the contract tomorrow',
  },
  {
    text: 'okay Cai, can you repeat the address?',
    lang: 'en',
    question: 'can you repeat the address?',
  },
  {
    text: 'Kay, who is bringing the projector?',
    lang: 'en',
    question: 'who is bringing the projector?',
  },
  {
    text: 'Cai, summarise what we agreed so far',
    lang: 'en',
    question: 'summarise what we agreed so far',
  },
  {
    text: 'Cai. Did anyone mention the deadline?',
    lang: 'en',
    question: 'Did anyone mention the deadline?',
  },
  {
    text: 'what was the number Noor gave, Cai?',
    lang: 'en',
    question: 'what was the number Noor gave',
  },
  { text: 'Cai, how many chairs did we say?', lang: 'en', question: 'how many chairs did we say?' },
  { text: 'Cai save that as a task', lang: 'en', question: 'save that as a task' },
  {
    text: 'hi Cai, is the contract signed yet?',
    lang: 'en',
    question: 'is the contract signed yet?',
  },
  { text: 'Cai, which date did Lina prefer', lang: 'en', question: 'which date did Lina prefer' },
  {
    text: 'Cai, draft a message to Sam about the invoice',
    lang: 'en',
    question: 'draft a message to Sam about the invoice',
  },
  {
    text: 'Cai, am I free Thursday afternoon?',
    lang: 'en',
    question: 'am I free Thursday afternoon?',
  },
  { text: 'Cai, what am I waiting on?', lang: 'en', question: 'what am I waiting on?' },
  // ---- English: not called
  { text: 'Kai said he would come on Thursday', lang: 'en', question: null },
  { text: 'okay so what is next on the list?', lang: 'en', question: null },
  { text: 'the sky looks grey today', lang: 'en', question: null },
  { text: 'K, I will do it tomorrow', lang: 'en', question: null },
  { text: 'Cai is taking notes, by the way', lang: 'en', question: null },
  { text: 'I asked Kai to send it last week', lang: 'en', question: null },
  { text: 'we should cite the report', lang: 'en', question: null },
  { text: 'Thanks Cai', lang: 'en', question: null },
  { text: 'Cai', lang: 'en', question: null },
  { text: 'Kay is late again', lang: 'en', question: null },
  { text: 'can I get a coffee', lang: 'en', question: null },
  { text: 'Cairo was lovely in March', lang: 'en', question: null },

  // ---- Arabic, Standard: called
  { text: 'كاي، ماذا قررنا بشأن السعر؟', lang: 'ar', question: 'ماذا قررنا بشأن السعر؟' },
  { text: 'يا كاي متى الاجتماع القادم', lang: 'ar', question: 'متى الاجتماع القادم' },
  { text: 'كاي، ذكّرني بإرسال العقد غدًا', lang: 'ar', question: 'ذكّرني بإرسال العقد غدًا' },
  { text: 'كاي هل ذكر أحد الموعد النهائي؟', lang: 'ar', question: 'هل ذكر أحد الموعد النهائي؟' },
  { text: 'كاي، من يحضر الملف؟', lang: 'ar', question: 'من يحضر الملف؟' },
  { text: 'ما الرقم الذي ذكرته نور يا كاي؟', lang: 'ar', question: 'ما الرقم الذي ذكرته نور' },
  // ---- Arabic, Egyptian: called
  {
    text: 'كاي، احنا اتفقنا على كام؟',
    lang: 'ar',
    variety: 'egyptian',
    question: 'احنا اتفقنا على كام؟',
  },
  {
    text: 'يا كاي، الميتنج الجاي امتى',
    lang: 'ar',
    variety: 'egyptian',
    question: 'الميتنج الجاي امتى',
  },
  {
    text: 'كاي فكرني ابعت العقد بكرة',
    lang: 'ar',
    variety: 'egyptian',
    question: 'فكرني ابعت العقد بكرة',
  },
  {
    text: 'كاي، مين قال هيجيب البروجكتور؟',
    lang: 'ar',
    variety: 'egyptian',
    question: 'مين قال هيجيب البروجكتور؟',
  },
  {
    text: 'كاي ايه اللي اتقال عن العنوان',
    lang: 'ar',
    variety: 'egyptian',
    question: 'ايه اللي اتقال عن العنوان',
  },
  // ---- Arabic, Gulf: called
  { text: 'كاي، وش قلنا عن الموعد؟', lang: 'ar', variety: 'gulf', question: 'وش قلنا عن الموعد؟' },
  {
    text: 'يا كاي متى الاجتماع الجاي',
    lang: 'ar',
    variety: 'gulf',
    question: 'متى الاجتماع الجاي',
  },
  {
    text: 'كاي ذكرني أرسل العقد بكرة',
    lang: 'ar',
    variety: 'gulf',
    question: 'ذكرني أرسل العقد بكرة',
  },
  {
    text: 'كاي، منو بيجيب البروجكتر؟',
    lang: 'ar',
    variety: 'gulf',
    question: 'منو بيجيب البروجكتر؟',
  },
  { text: 'كاي شلون نوصل للمكان', lang: 'ar', variety: 'gulf', question: 'شلون نوصل للمكان' },
  // ---- Arabic, Levantine: called
  {
    text: 'كاي، شو اتفقنا عالسعر؟',
    lang: 'ar',
    variety: 'levantine',
    question: 'شو اتفقنا عالسعر؟',
  },
  {
    text: 'يا كاي ايمتى الاجتماع الجاي',
    lang: 'ar',
    variety: 'levantine',
    question: 'ايمتى الاجتماع الجاي',
  },
  {
    text: 'كاي ذكرني ابعت العقد بكرا',
    lang: 'ar',
    variety: 'levantine',
    question: 'ذكرني ابعت العقد بكرا',
  },
  {
    text: 'كاي، مين رح يجيب البروجكتور؟',
    lang: 'ar',
    variety: 'levantine',
    question: 'مين رح يجيب البروجكتور؟',
  },
  {
    text: 'كاي قديش قلنا عدد الكراسي',
    lang: 'ar',
    variety: 'levantine',
    question: 'قديش قلنا عدد الكراسي',
  },
  // ---- Arabic, Maghrebi: called
  {
    text: 'كاي، شنو قررنا على التمن؟',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'شنو قررنا على التمن؟',
  },
  {
    text: 'يا كاي فوقاش الاجتماع الجاي',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'فوقاش الاجتماع الجاي',
  },
  {
    text: 'كاي فكرني نصيفط العقد غدا',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'فكرني نصيفط العقد غدا',
  },
  {
    text: 'كاي، شكون غادي يجيب البروجكتور؟',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'شكون غادي يجيب البروجكتور؟',
  },
  { text: 'كاي شحال قلنا من كرسي', lang: 'ar', variety: 'maghrebi', question: 'شحال قلنا من كرسي' },
  // ---- Arabic: not called
  { text: 'كاي جاي بكرة', lang: 'ar', variety: 'egyptian', question: null },
  { text: 'كاي بياخد ملاحظات دلوقتي', lang: 'ar', variety: 'egyptian', question: null },
  { text: 'طيب شو قررنا عالسعر؟', lang: 'ar', variety: 'levantine', question: null },
  { text: 'شكرًا كاي', lang: 'ar', question: null },
  { text: 'كاي', lang: 'ar', question: null },
  { text: 'قلت لكاي يبعت العقد', lang: 'ar', variety: 'gulf', question: null },
  { text: 'الجو حلو اليوم', lang: 'ar', question: null },
  { text: 'كاي وصل متأخر', lang: 'ar', variety: 'levantine', question: null },
  { text: 'ممكن قهوة', lang: 'ar', question: null },
  { text: 'كايرو كانت جميلة في مارس', lang: 'ar', variety: 'egyptian', question: null },

  // ---- French: called
  {
    text: "Caï, qu'est-ce qu'on a décidé pour le prix ?",
    lang: 'fr',
    question: "qu'est-ce qu'on a décidé pour le prix ?",
  },
  {
    text: 'Hé Kaï, quand est la prochaine réunion',
    lang: 'fr',
    question: 'quand est la prochaine réunion',
  },
  {
    text: "Caï, rappelle-moi d'envoyer le contrat demain",
    lang: 'fr',
    question: "rappelle-moi d'envoyer le contrat demain",
  },
  { text: 'Caï qui apporte le projecteur ?', lang: 'fr', question: 'qui apporte le projecteur ?' },
  { text: 'Caï, tu peux répéter l’adresse ?', lang: 'fr', question: 'tu peux répéter l’adresse ?' },
  { text: 'Caï, combien de chaises on a dit', lang: 'fr', question: 'combien de chaises on a dit' },
  { text: 'c’était quel chiffre, Caï ?', lang: 'fr', question: 'c’était quel chiffre' },
  { text: 'Caï, résume ce qu’on a convenu', lang: 'fr', question: 'résume ce qu’on a convenu' },
  {
    text: 'Caï, est-ce que quelqu’un a parlé de la date limite ?',
    lang: 'fr',
    question: 'est-ce que quelqu’un a parlé de la date limite ?',
  },
  { text: 'Caï, où est la réunion', lang: 'fr', question: 'où est la réunion' },
  { text: 'Caï, enregistre ça comme tâche', lang: 'fr', question: 'enregistre ça comme tâche' },
  {
    text: 'Caï, est-ce que je suis libre jeudi après-midi ?',
    lang: 'fr',
    question: 'est-ce que je suis libre jeudi après-midi ?',
  },
  // ---- French: not called
  { text: 'Kaï a dit qu’il viendrait jeudi', lang: 'fr', question: null },
  { text: 'bon, qu’est-ce qu’on fait ensuite ?', lang: 'fr', question: null },
  { text: 'le ciel est gris aujourd’hui', lang: 'fr', question: null },
  { text: 'Merci Caï', lang: 'fr', question: null },
  { text: 'Caï prend des notes, au fait', lang: 'fr', question: null },
  { text: 'j’ai demandé à Kaï d’envoyer le contrat', lang: 'fr', question: null },
  { text: 'Caï', lang: 'fr', question: null },
  { text: 'on peut avoir un café', lang: 'fr', question: null },

  // ---- Turkish: called
  {
    text: 'Cai, fiyat konusunda ne karar verdik?',
    lang: 'tr',
    question: 'fiyat konusunda ne karar verdik?',
  },
  {
    text: 'Kay, bir sonraki toplantı ne zaman',
    lang: 'tr',
    question: 'bir sonraki toplantı ne zaman',
  },
  {
    text: 'Cai yarın sözleşmeyi göndermemi hatırlat',
    lang: 'tr',
    question: 'yarın sözleşmeyi göndermemi hatırlat',
  },
  { text: 'Cai, projektörü kim getiriyor?', lang: 'tr', question: 'projektörü kim getiriyor?' },
  { text: 'Cai adresi tekrar eder misin', lang: 'tr', question: 'adresi tekrar eder misin' },
  { text: 'Cai, kaç sandalye dedik?', lang: 'tr', question: 'kaç sandalye dedik?' },
  { text: 'Noor hangi rakamı söyledi, Cai?', lang: 'tr', question: 'Noor hangi rakamı söyledi' },
  {
    text: 'Cai, şimdiye kadar anlaştıklarımızı özetle',
    lang: 'tr',
    question: 'şimdiye kadar anlaştıklarımızı özetle',
  },
  {
    text: 'Cai, son teslim tarihinden bahseden oldu mu?',
    lang: 'tr',
    question: 'son teslim tarihinden bahseden oldu mu?',
  },
  { text: 'Cai toplantı nerede', lang: 'tr', question: 'toplantı nerede' },
  { text: 'Cai, bunu görev olarak kaydet', lang: 'tr', question: 'bunu görev olarak kaydet' },
  {
    text: 'Cai, perşembe öğleden sonra boş muyum?',
    lang: 'tr',
    question: 'perşembe öğleden sonra boş muyum?',
  },
  // ---- Turkish: not called
  { text: 'Kay perşembe geleceğini söyledi', lang: 'tr', question: null },
  { text: 'tamam, sırada ne var?', lang: 'tr', question: null },
  { text: 'hava bugün gri', lang: 'tr', question: null },
  { text: 'Teşekkürler Cai', lang: 'tr', question: null },
  { text: 'Cai bu arada not alıyor', lang: 'tr', question: null },
  { text: 'Kay’a sözleşmeyi göndermesini söyledim', lang: 'tr', question: null },
  { text: 'Cai', lang: 'tr', question: null },
  { text: 'bir kahve alabilir miyim', lang: 'tr', question: null },
  // ---- About the screen (M17 I13h): called, and asking what's shown
  {
    text: "Cai, what's on the screen?",
    lang: 'en',
    question: "what's on the screen?",
    screen: true,
  },
  {
    text: 'Cai, can you read this slide?',
    lang: 'en',
    question: 'can you read this slide?',
    screen: true,
  },
  {
    text: 'Cai, what does this chart show?',
    lang: 'en',
    question: 'what does this chart show?',
    screen: true,
  },
  {
    text: 'what are we looking at, Cai?',
    lang: 'en',
    question: 'what are we looking at',
    screen: true,
  },
  {
    text: 'Cai, summarise the numbers on this page',
    lang: 'en',
    question: 'summarise the numbers on this page',
    screen: true,
  },
  // ---- English: called, but not about the screen
  {
    text: 'Cai, remind me to book the table for dinner',
    lang: 'en',
    question: 'remind me to book the table for dinner',
  },
  {
    text: 'Cai, what page are we on in the contract talks?',
    lang: 'en',
    question: 'what page are we on in the contract talks?',
  },
  { text: 'كاي، ماذا على الشاشة؟', lang: 'ar', question: 'ماذا على الشاشة؟', screen: true },
  { text: 'كاي، ما المعروض الآن؟', lang: 'ar', question: 'ما المعروض الآن؟', screen: true },
  { text: 'كاي، اقرأ هذه الشريحة', lang: 'ar', question: 'اقرأ هذه الشريحة', screen: true },
  { text: 'كاي، ماذا قررنا بشأن الموعد؟', lang: 'ar', question: 'ماذا قررنا بشأن الموعد؟' },
  {
    text: 'كاي، إيه اللي على الشاشة؟',
    lang: 'ar',
    variety: 'egyptian',
    question: 'إيه اللي على الشاشة؟',
    screen: true,
  },
  {
    text: 'كاي، شايف الجدول ده؟',
    lang: 'ar',
    variety: 'egyptian',
    question: 'شايف الجدول ده؟',
    screen: true,
  },
  {
    text: 'كاي، اقرا السلايد دي',
    lang: 'ar',
    variety: 'egyptian',
    question: 'اقرا السلايد دي',
    screen: true,
  },
  {
    text: 'كاي، فكرني أحجز الترابيزة بكرة',
    lang: 'ar',
    variety: 'egyptian',
    question: 'فكرني أحجز الترابيزة بكرة',
  },
  {
    text: 'كاي، وش اللي عالشاشة؟',
    lang: 'ar',
    variety: 'gulf',
    question: 'وش اللي عالشاشة؟',
    screen: true,
  },
  {
    text: 'كاي، تشوف الرسم هذا؟',
    lang: 'ar',
    variety: 'gulf',
    question: 'تشوف الرسم هذا؟',
    screen: true,
  },
  {
    text: 'كاي، متى الاجتماع الجاي؟',
    lang: 'ar',
    variety: 'gulf',
    question: 'متى الاجتماع الجاي؟',
  },
  {
    text: 'كاي، شو اللي عالشاشة؟',
    lang: 'ar',
    variety: 'levantine',
    question: 'شو اللي عالشاشة؟',
    screen: true,
  },
  {
    text: 'كاي، اقرا هالصفحة',
    lang: 'ar',
    variety: 'levantine',
    question: 'اقرا هالصفحة',
    screen: true,
  },
  {
    text: 'كاي، شايف هاد الجدول؟',
    lang: 'ar',
    variety: 'levantine',
    question: 'شايف هاد الجدول؟',
    screen: true,
  },
  { text: 'كاي، شو قررنا عالسعر؟', lang: 'ar', variety: 'levantine', question: 'شو قررنا عالسعر؟' },
  {
    text: 'كاي، شنو كاين فالشاشة؟',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'شنو كاين فالشاشة؟',
    screen: true,
  },
  {
    text: 'كاي، شوف هاد الصورة',
    lang: 'ar',
    variety: 'maghrebi',
    question: 'شوف هاد الصورة',
    screen: true,
  },
  { text: 'كاي، شحال خلصنا؟', lang: 'ar', variety: 'maghrebi', question: 'شحال خلصنا؟' },
  {
    text: "Cai, qu'est-ce qu'il y a à l'écran ?",
    lang: 'fr',
    question: "qu'est-ce qu'il y a à l'écran ?",
    screen: true,
  },
  { text: 'Cai, tu vois ce tableau ?', lang: 'fr', question: 'tu vois ce tableau ?', screen: true },
  { text: 'Cai, lis cette diapo', lang: 'fr', question: 'lis cette diapo', screen: true },
  {
    text: 'Cai, quand est la prochaine réunion ?',
    lang: 'fr',
    question: 'quand est la prochaine réunion ?',
  },
  { text: 'Cai, ekranda ne var?', lang: 'tr', question: 'ekranda ne var?', screen: true },
  {
    text: 'Cai, bu tabloyu okur musun?',
    lang: 'tr',
    question: 'bu tabloyu okur musun?',
    screen: true,
  },
  { text: 'Cai, ne görüyorsun?', lang: 'tr', question: 'ne görüyorsun?', screen: true },
  { text: 'Cai, toplantı saat kaçta?', lang: 'tr', question: 'toplantı saat kaçta?' },
];
