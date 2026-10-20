/**
 * What people write to Cai or a friend when they want something kept (M16 G13), labelled by hand
 * before the rules met them: whether it's an ask to keep something at all, whether it's a
 * reminder, the title it keeps ('' when the words point back at what was said before: "save it",
 * "احفظها"), and the time it's for as the date reader should find it. The near-misses are here on
 * purpose, since a rule that keeps what wasn't asked writes into someone's actions: a question
 * that opens like one ("remind me what we agreed"), a sentence that tells of keeping ("I added it
 * to my tasks"), a save of something else ("save the date", "احفظ رقمي", "dosyayı kaydet").
 * `chat-save-golden.test.ts` holds each language to them.
 */
export interface SaveLine {
  text: string;
  lang: 'en' | 'ar' | 'fr' | 'tr';
  /** null: not an ask to keep anything. Else whether it's a reminder and the title it keeps, '' for "it". */
  save: { remind: boolean; title: string } | null;
  /** The time it's for, as the date reader should find it, when one is said. */
  when?: string;
}

export const SAVE_GOLDEN: SaveLine[] = [
  // ---- English
  { text: 'Save it as a task', lang: 'en', save: { remind: false, title: '' } },
  { text: 'save this as an action please', lang: 'en', save: { remind: false, title: '' } },
  { text: 'Can you add that to my to-do list?', lang: 'en', save: { remind: false, title: '' } },
  { text: 'make it a task', lang: 'en', save: { remind: false, title: '' } },
  { text: 'Turn this into an action', lang: 'en', save: { remind: false, title: '' } },
  { text: 'save it', lang: 'en', save: { remind: false, title: '' } },
  { text: 'keep this for later', lang: 'en', save: { remind: false, title: '' } },
  { text: 'remind me', lang: 'en', save: { remind: true, title: '' } },
  {
    text: 'remind me about it tomorrow',
    lang: 'en',
    save: { remind: true, title: '' },
    when: 'tomorrow',
  },
  {
    text: 'Remind me to call Sam tomorrow at 9',
    lang: 'en',
    save: { remind: true, title: 'Call Sam' },
    when: 'tomorrow at 9',
  },
  {
    text: 'remind me on Friday to send the invoice to Nile Dental',
    lang: 'en',
    save: { remind: true, title: 'Send the invoice to Nile Dental' },
    when: 'on Friday',
  },
  {
    text: "Cai, don't let me forget to renew my passport",
    lang: 'en',
    save: { remind: true, title: 'Renew my passport' },
  },
  {
    text: 'add a task: book the venue for the offsite',
    lang: 'en',
    save: { remind: false, title: 'Book the venue for the offsite' },
  },
  {
    text: 'new task - review the contract',
    lang: 'en',
    save: { remind: false, title: 'Review the contract' },
  },
  {
    text: 'please create a reminder to water the plants tonight',
    lang: 'en',
    save: { remind: true, title: 'Water the plants' },
    when: 'tonight',
  },
  { text: 'add buy milk to my list', lang: 'en', save: { remind: false, title: 'Buy milk' } },
  {
    text: 'put the venue deposit on my to-dos',
    lang: 'en',
    save: { remind: false, title: 'The venue deposit' },
  },
  {
    text: 'To-do: ask Maya for the logo files',
    lang: 'en',
    save: { remind: false, title: 'Ask Maya for the logo files' },
  },
  { text: 'remind me what I promised Sam', lang: 'en', save: null },
  { text: 'remind me who sent the contract', lang: 'en', save: null },
  { text: 'I added it to my tasks', lang: 'en', save: null },
  { text: 'did you save it as a task?', lang: 'en', save: null },
  { text: 'how do I add a task?', lang: 'en', save: null },
  { text: 'what are my tasks', lang: 'en', save: null },
  { text: 'should I make it a task?', lang: 'en', save: null },
  { text: 'that reminds me of my trip', lang: 'en', save: null },
  { text: 'save me a seat', lang: 'en', save: null },
  { text: 'Can you remind me how to set up the domain?', lang: 'en', save: null },
  { text: 'remind me your opening hours', lang: 'en', save: null },
  { text: 'note that I am vegetarian', lang: 'en', save: null },
  { text: 'keep it short', lang: 'en', save: null },
  { text: 'put it on the calendar', lang: 'en', save: null },
  { text: 'save the date', lang: 'en', save: null },
  { text: 'add Sam to the group', lang: 'en', save: null },
  {
    text: 'I need you to remind me to call mom on Sunday',
    lang: 'en',
    save: { remind: true, title: 'Call mom' },
    when: 'on Sunday',
  },
  { text: 'Note down: call the bank', lang: 'en', save: { remind: false, title: 'Call the bank' } },
  {
    text: 'Add a reminder for my dentist appointment on Monday at 3pm',
    lang: 'en',
    save: { remind: true, title: 'My dentist appointment' },
    when: 'on Monday at 3pm',
  },

  // ---- Arabic
  { text: 'احفظها كمهمة', lang: 'ar', save: { remind: false, title: '' } },
  { text: 'ضيفها لمهامي', lang: 'ar', save: { remind: false, title: '' } },
  { text: 'ممكن تضيف ده للإجراءات؟', lang: 'ar', save: { remind: false, title: '' } },
  { text: 'خليها مهمة', lang: 'ar', save: { remind: false, title: '' } },
  { text: 'سجلها تذكير', lang: 'ar', save: { remind: true, title: '' } },
  { text: 'احفظها', lang: 'ar', save: { remind: false, title: '' } },
  { text: 'ذكرني', lang: 'ar', save: { remind: true, title: '' } },
  { text: 'فكرني بيها بكرة', lang: 'ar', save: { remind: true, title: '' }, when: 'بكرة' },
  {
    text: 'ذكرني بكرة اتصل بسامي',
    lang: 'ar',
    save: { remind: true, title: 'اتصل بسامي' },
    when: 'بكرة',
  },
  {
    text: 'فكرني ادفع الإيجار يوم الخميس',
    lang: 'ar',
    save: { remind: true, title: 'ادفع الإيجار' },
    when: 'يوم الخميس',
  },
  { text: 'ذكّرني أن أرسل الفاتورة', lang: 'ar', save: { remind: true, title: 'أرسل الفاتورة' } },
  { text: 'فكرني بالاجتماع', lang: 'ar', save: { remind: true, title: 'الاجتماع' } },
  {
    text: 'متخلينيش انسى اجدد الباسبور',
    lang: 'ar',
    save: { remind: true, title: 'اجدد الباسبور' },
  },
  { text: 'أضف مهمة: حجز القاعة', lang: 'ar', save: { remind: false, title: 'حجز القاعة' } },
  {
    text: 'ضيف مهمة جديدة مراجعة العقد',
    lang: 'ar',
    save: { remind: false, title: 'مراجعة العقد' },
  },
  { text: 'حط شراء الحليب في قائمتي', lang: 'ar', save: { remind: false, title: 'شراء الحليب' } },
  {
    text: 'مهمة: أسأل ريم عن الملفات',
    lang: 'ar',
    save: { remind: false, title: 'أسأل ريم عن الملفات' },
  },
  { text: 'ذكرني ايه اللي اتفقنا عليه', lang: 'ar', save: null },
  { text: 'ذكرني مين بعت العقد', lang: 'ar', save: null },
  { text: 'ضفتها لمهامي خلاص', lang: 'ar', save: null },
  { text: 'هل حفظتها كمهمة؟', lang: 'ar', save: null },
  { text: 'ايه مهامي', lang: 'ar', save: null },
  { text: 'احفظ الله عليك', lang: 'ar', save: null },
  { text: 'احفظ رقمي', lang: 'ar', save: null },
  { text: 'سجلني في الدورة', lang: 'ar', save: null },
  { text: 'حطها في التلاجة', lang: 'ar', save: null },
  {
    text: 'ممكن تفكرني اجيب الدوا بكرة',
    lang: 'ar',
    save: { remind: true, title: 'اجيب الدوا' },
    when: 'بكرة',
  },

  // ---- French
  { text: 'enregistre-le comme tâche', lang: 'fr', save: { remind: false, title: '' } },
  { text: 'ajoute ça à mes tâches', lang: 'fr', save: { remind: false, title: '' } },
  { text: 'Tu peux mettre ça dans mes actions ?', lang: 'fr', save: { remind: false, title: '' } },
  { text: 'garde-le', lang: 'fr', save: { remind: false, title: '' } },
  { text: 'rappelle-moi', lang: 'fr', save: { remind: true, title: '' } },
  {
    text: "rappelle-moi d'appeler Sam demain",
    lang: 'fr',
    save: { remind: true, title: 'Appeler Sam' },
    when: 'demain',
  },
  {
    text: 'Rappelle-moi de payer le loyer vendredi',
    lang: 'fr',
    save: { remind: true, title: 'Payer le loyer' },
    when: 'vendredi',
  },
  {
    text: 'fais-moi penser à renouveler mon passeport',
    lang: 'fr',
    save: { remind: true, title: 'Renouveler mon passeport' },
  },
  {
    text: 'ajoute une tâche : réserver la salle',
    lang: 'fr',
    save: { remind: false, title: 'Réserver la salle' },
  },
  {
    text: 'nouvelle tâche : relire le contrat',
    lang: 'fr',
    save: { remind: false, title: 'Relire le contrat' },
  },
  {
    text: 'ajoute acheter du pain à mes tâches',
    lang: 'fr',
    save: { remind: false, title: 'Acheter du pain' },
  },
  { text: 'rappelle-moi ce que Sam a dit', lang: 'fr', save: null },
  { text: 'rappelle-moi qui a envoyé le contrat', lang: 'fr', save: null },
  { text: "je l'ai ajouté à mes tâches", lang: 'fr', save: null },
  { text: 'quelles sont mes tâches ?', lang: 'fr', save: null },
  { text: 'ça me rappelle mon voyage', lang: 'fr', save: null },
  { text: 'garde-le pour toi', lang: 'fr', save: null },
  { text: 'ajoute Sam au groupe', lang: 'fr', save: null },
  { text: 'rappelle-toi de moi', lang: 'fr', save: null },
  {
    text: 'tu peux me rappeler de prendre le pain ?',
    lang: 'fr',
    save: { remind: true, title: 'Prendre le pain' },
  },

  // ---- Turkish
  { text: 'bunu görev olarak kaydet', lang: 'tr', save: { remind: false, title: '' } },
  { text: 'görevlerime ekle', lang: 'tr', save: { remind: false, title: '' } },
  { text: 'bunu kaydet', lang: 'tr', save: { remind: false, title: '' } },
  { text: 'hatırlat', lang: 'tr', save: { remind: true, title: '' } },
  {
    text: 'bunu bana yarın hatırlat',
    lang: 'tr',
    save: { remind: true, title: '' },
    when: 'yarın',
  },
  {
    text: "yarın Sami'yi aramayı hatırlat",
    lang: 'tr',
    save: { remind: true, title: "Sami'yi ara" },
    when: 'yarın',
  },
  {
    text: 'bana cuma günü kirayı ödemeyi hatırlat',
    lang: 'tr',
    save: { remind: true, title: 'Kirayı öde' },
    when: 'cuma günü',
  },
  { text: 'yeni görev: salonu ayırt', lang: 'tr', save: { remind: false, title: 'Salonu ayırt' } },
  { text: 'süt almayı görevlerime ekle', lang: 'tr', save: { remind: false, title: 'Süt al' } },
  { text: 'bana neyi beklediğimi hatırlat', lang: 'tr', save: null },
  { text: 'Sami ne dedi hatırlat', lang: 'tr', save: null },
  { text: 'görevlerime ekledim', lang: 'tr', save: null },
  { text: 'görevlerim neler', lang: 'tr', save: null },
  { text: 'bunu bana hatırlatma', lang: 'tr', save: null },
  { text: 'dosyayı kaydet', lang: 'tr', save: null },
  { text: 'hatırlattın mı?', lang: 'tr', save: null },
  { text: 'beni hatırlıyor musun', lang: 'tr', save: null },
  {
    text: 'lütfen bana ilaç almayı hatırlat',
    lang: 'tr',
    save: { remind: true, title: 'İlaç al' },
  },
];
