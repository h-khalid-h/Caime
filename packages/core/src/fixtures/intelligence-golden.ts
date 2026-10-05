/**
 * The message intelligence's golden set: lines people write, labelled by hand with what the
 * rules should read in them. `intelligence-golden.test.ts` measures precision and recall per
 * label and language against it and fails below the floors there, printing every line it got
 * wrong. Half the lines are deliberate negatives (pleasantries, negations, quotes, third
 * persons), since a false card costs more trust than a missed one.
 *
 * A label left out is false. `now` for the English lines is Mon 2026-10-05 10:00 in New York;
 * for the Arabic lines, the same moment in Cairo.
 */
export interface GoldenLine {
  text: string;
  lang: 'en' | 'ar';
  expect: Partial<Record<'question' | 'request' | 'commitment' | 'decision', boolean>>;
  /** The due date the first suggestion should carry, as YYYY-MM-DD, or null for none. */
  due?: string | null;
}

export const INTELLIGENCE_GOLDEN: GoldenLine[] = [
  // ---- English: commitments
  {
    text: "I'll send you the Q3 report by Friday",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-09',
  },
  {
    text: "I'll send the proposal tomorrow.",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  { text: "I'm going to cancel the subscription", lang: 'en', expect: { commitment: true } },
  {
    text: "I'll get back to you on Monday",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-12',
  },
  {
    text: "Thanks! I'll send the deck tomorrow. Also can you check the numbers?",
    lang: 'en',
    expect: { commitment: true, request: true, question: true },
  },
  {
    text: "Remember to bring the passports. I'll book the taxi for 6am",
    lang: 'en',
    expect: { request: true, commitment: true },
  },
  {
    text: "I won't be able to send it, but I'll call you tomorrow",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: "I'll pay you $2.5k tomorrow",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: "I'll send v2.1 of the deck tomorrow",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: 'Let me check with the team and send you the numbers by Wednesday',
    lang: 'en',
    expect: { commitment: true },
  },
  { text: "We'll deliver the parts next week", lang: 'en', expect: { commitment: true } },
  { text: 'I promise to review it tonight', lang: 'en', expect: { commitment: true } },
  // ---- English: not commitments
  { text: "I won't be able to make it tomorrow", lang: 'en', expect: {} },
  { text: "I can't send it today", lang: 'en', expect: {} },
  { text: "Let me know when you're free", lang: 'en', expect: {} },
  { text: "I can see why you'd think that", lang: 'en', expect: {} },
  { text: "We'll see.", lang: 'en', expect: {} },
  { text: 'I think so', lang: 'en', expect: {} },
  { text: 'He said "I\'ll send it Monday" but he never did', lang: 'en', expect: {} },
  { text: 'Forwarded: "I\'ll transfer the deposit tomorrow"', lang: 'en', expect: {} },
  { text: "> I'll send it Friday\nThat was two weeks ago", lang: 'en', expect: {} },
  { text: "I'll try to send it tonight", lang: 'en', expect: {} },
  { text: "I'll be there at 7", lang: 'en', expect: {} },
  // ---- English: requests
  {
    text: 'Can you review the contract before Thursday 3pm?',
    lang: 'en',
    expect: { request: true, question: true },
    due: '2026-10-08',
  },
  {
    text: 'Can you send me the document tomorrow?',
    lang: 'en',
    expect: { request: true, question: true },
    due: '2026-10-06',
  },
  {
    text: 'Could you send me the contract by Friday?',
    lang: 'en',
    expect: { request: true, question: true },
    due: '2026-10-09',
  },
  {
    text: 'Please send the invoice by Monday',
    lang: 'en',
    expect: { request: true },
    due: '2026-10-12',
  },
  {
    text: 'Can you send the file to sam@data-c.com by Friday?',
    lang: 'en',
    expect: { request: true, question: true },
    due: '2026-10-09',
  },
  { text: 'Send me the photos when you can', lang: 'en', expect: { request: true } },
  { text: "Don't forget to sign the form", lang: 'en', expect: { request: true } },
  {
    text: 'Would you mind checking the numbers?',
    lang: 'en',
    expect: { request: true, question: true },
  },
  { text: 'Book a table for 4 at 8', lang: 'en', expect: { request: true } },
  { text: 'Check out this article https://example.org/a', lang: 'en', expect: { request: true } },
  { text: 'Kindly confirm the booking', lang: 'en', expect: { request: true } },
  // ---- English: not requests
  { text: 'Thanks, please ignore my last message', lang: 'en', expect: {} },
  { text: 'Please find attached the signed contract', lang: 'en', expect: {} },
  { text: 'Can you believe it?', lang: 'en', expect: { question: true } },
  { text: 'Could you not call me after 9pm?', lang: 'en', expect: { question: true } },
  { text: 'Order #48213 shipped, tracking 1Z999AA10123456784', lang: 'en', expect: {} },
  { text: 'Order delivered this morning', lang: 'en', expect: {} },
  { text: 'Send me nothing until Monday please', lang: 'en', expect: {} },
  { text: 'Update 55', lang: 'en', expect: {} },
  // ---- English: questions
  { text: 'Is the report ready', lang: 'en', expect: { question: true } },
  { text: 'Are you coming tonight', lang: 'en', expect: { question: true } },
  { text: 'How much is it', lang: 'en', expect: { question: true } },
  { text: 'When do we leave', lang: 'en', expect: { question: true } },
  { text: "What's the plan for Friday", lang: 'en', expect: { question: true } },
  { text: 'Did you see the email', lang: 'en', expect: { question: true } },
  { text: 'Call me maybe?', lang: 'en', expect: { question: true } },
  { text: 'Where are you', lang: 'en', expect: { question: true } },
  { text: 'Do you have the keys', lang: 'en', expect: { question: true } },
  // ---- English: not questions
  { text: 'Will do', lang: 'en', expect: {} },
  { text: 'Have a nice weekend', lang: 'en', expect: {} },
  { text: 'Have fun', lang: 'en', expect: {} },
  { text: 'Was great seeing you', lang: 'en', expect: {} },
  { text: 'Did it already', lang: 'en', expect: {} },
  { text: 'Do whatever you think is best', lang: 'en', expect: {} },
  { text: "Can't wait", lang: 'en', expect: {} },
  { text: 'What a day', lang: 'en', expect: {} },
  { text: 'How lovely', lang: 'en', expect: {} },
  { text: 'Who knows', lang: 'en', expect: {} },
  { text: 'Is anyone else running late', lang: 'en', expect: { question: true } },
  { text: 'Great, see you then', lang: 'en', expect: {} },
  { text: 'Thanks a lot!', lang: 'en', expect: {} },
  // ---- English: decisions
  { text: 'We decided to go with vendor B.', lang: 'en', expect: { decision: true } },
  { text: "Let's go with the blue one", lang: 'en', expect: { decision: true } },
  { text: 'Approved ✅', lang: 'en', expect: { decision: true } },
  { text: 'We agreed on Friday for the launch', lang: 'en', expect: { decision: true } },
  { text: "It's settled: dinner at ours", lang: 'en', expect: { decision: true } },
  { text: "We're going with the second option", lang: 'en', expect: { decision: true } },
  { text: 'Final decision: no more meetings on Fridays', lang: 'en', expect: { decision: true } },
  // ---- English: not decisions
  { text: 'Was the budget approved?', lang: 'en', expect: { question: true } },
  { text: "The budget wasn't approved.", lang: 'en', expect: {} },
  { text: "How's it going with the move?", lang: 'en', expect: { question: true } },
  { text: 'Not sure we decided anything yet', lang: 'en', expect: {} },
  {
    text: "Your appointment request isn't approved until the team confirms it",
    lang: 'en',
    expect: {},
  },
  { text: 'Hopefully it gets approved this week', lang: 'en', expect: {} },
  { text: 'Have we decided on the venue', lang: 'en', expect: { question: true } },
  { text: 'Going with the flow today', lang: 'en', expect: {} },

  // ---- Arabic: commitments
  {
    text: 'هبعتلك العقد بكرة الساعة 5',
    lang: 'ar',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: 'راح أرسل لك الملف يوم الأحد',
    lang: 'ar',
    expect: { commitment: true },
    due: '2026-10-11',
  },
  { text: 'رح ابعتلك الصور بكرا', lang: 'ar', expect: { commitment: true }, due: '2026-10-06' },
  { text: 'سأرسل لك التقرير غداً', lang: 'ar', expect: { commitment: true }, due: '2026-10-06' },
  { text: 'هكلمك بعد الاجتماع', lang: 'ar', expect: { commitment: true } },
  { text: 'راح نرسل العرض الخميس', lang: 'ar', expect: { commitment: true }, due: '2026-10-08' },
  { text: 'بحولك المبلغ اليوم', lang: 'ar', expect: { commitment: true } },
  // ---- Arabic: not commitments
  { text: 'مش هبعت حاجة النهارده', lang: 'ar', expect: {} },
  { text: 'ما راح أقدر أجي بكرة', lang: 'ar', expect: {} },
  { text: 'أخوي راح يجيب الأغراض بكرة', lang: 'ar', expect: {} },
  { text: 'رح يمطر بكرا', lang: 'ar', expect: {} },
  { text: 'شفت الفيلم؟ راح تحبه', lang: 'ar', expect: { question: true } },
  { text: 'قال لي: "راح أرسل لك العقد بكرة" بس ما أرسل شي', lang: 'ar', expect: {} },
  { text: 'الله يبارك فيك', lang: 'ar', expect: {} },
  { text: 'بدي شيكولاتة 🍫', lang: 'ar', expect: {} },
  // ---- Arabic: requests
  { text: 'ممكن تبعتلي الفاتورة؟', lang: 'ar', expect: { request: true, question: true } },
  {
    text: 'تقدر ترسل لي العرض قبل الخميس؟',
    lang: 'ar',
    expect: { request: true, question: true },
    due: '2026-10-08',
  },
  { text: 'فيك تبعتلي الرقم؟', lang: 'ar', expect: { request: true, question: true } },
  { text: 'لو سمحت ابعتلي العقد', lang: 'ar', expect: { request: true } },
  { text: 'ياريت تراجع الملف قبل بكرة', lang: 'ar', expect: { request: true }, due: '2026-10-06' },
  { text: 'أرجو إرسال التقرير اليوم', lang: 'ar', expect: { request: true } },
  { text: 'بدك تبعتلي العنوان', lang: 'ar', expect: { request: true } },
  { text: 'كلمني لما توصل', lang: 'ar', expect: { request: true } },
  // ---- Arabic: not requests
  { text: 'ممكن أتأخر شوية', lang: 'ar', expect: {} },
  { text: 'مش ممكن ده يحصل تاني', lang: 'ar', expect: {} },
  { text: 'الله يبارك فيك وفي عيالك', lang: 'ar', expect: {} },
  { text: 'شو بدك تاكل؟', lang: 'ar', expect: { question: true } },
  { text: 'ممكن نتقابل الأسبوع الجاي', lang: 'ar', expect: {} },
  // ---- Arabic: questions
  { text: 'امتى الاجتماع', lang: 'ar', expect: { question: true } },
  { text: 'وين الملف', lang: 'ar', expect: { question: true } },
  { text: 'هل وصلك العقد؟', lang: 'ar', expect: { question: true } },
  { text: 'كم السعر', lang: 'ar', expect: { question: true } },
  { text: 'شلون الشغل', lang: 'ar', expect: { question: true } },
  // ---- Arabic: not questions
  { text: 'ما شاء الله', lang: 'ar', expect: {} },
  { text: 'ليش لا', lang: 'ar', expect: {} },
  { text: 'شو هالحلو', lang: 'ar', expect: {} },
  { text: 'ما عندي وقت اليوم', lang: 'ar', expect: {} },
  { text: 'ما وصلني شي', lang: 'ar', expect: {} },
  { text: 'أبشر، خلاص تمام', lang: 'ar', expect: {} },
  // ---- Arabic: decisions
  { text: 'اتفقنا على العرض التاني', lang: 'ar', expect: { decision: true } },
  { text: 'قررنا نأجل السفر', lang: 'ar', expect: { decision: true } },
  { text: 'خلاص نمشي على الخطة الأولى', lang: 'ar', expect: { decision: true } },
  { text: 'تمت الموافقة على الميزانية', lang: 'ar', expect: { decision: true } },
  // ---- Arabic: not decisions
  { text: 'انت موافق؟', lang: 'ar', expect: { question: true } },
  { text: 'ما وافقنا على شي لسه', lang: 'ar', expect: {} },
  { text: 'هل اتفقتوا على موعد؟', lang: 'ar', expect: { question: true } },
  { text: 'مش موافق على كده', lang: 'ar', expect: {} },
  // ---- Dates read as the words place them (review 2026-10-05, intelligence M)
  {
    text: "I'll pay you back on the 12th",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-12',
  },
  {
    text: "I'll send the invoice tomorrow evening",
    lang: 'en',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: 'I sent the files last Friday, did you get them?',
    lang: 'en',
    expect: { question: true },
    due: null,
  },
  { text: 'We had dinner at 8 and it was lovely', lang: 'en', expect: {} },
  {
    text: 'رح أبعتلك الملف بعد أسبوعين',
    lang: 'ar',
    expect: { commitment: true },
    due: '2026-10-19',
  },
];
