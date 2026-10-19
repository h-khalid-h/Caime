import type { GoldenLine } from './intelligence-golden';

/**
 * Arabic as it's written in four varieties, held out from the rules (M16 G10, review 2026-10-17
 * §5 M: "no Gulf or Maghrebi dialect lines"). Written before the rules were measured on them, by
 * what people type in Cairo, the Gulf, the Levant and the Maghreb (Morocco first, Algeria and
 * Tunisia beside it): no marks, ه for ة, ى for ي, the words of each place. These lines are never
 * the ones a rule is fixed against: a fix brings its own lines to `intelligence-golden.ts`, and
 * this set says whether it carried over to words nobody tuned it for.
 *
 * `intelligence-heldout.test.ts` holds each variety to floors set at what was measured, only ever
 * raised. A label left out is false; `now` is Mon 2026-10-05 14:00 UTC on each variety's clock.
 */
export type HeldOutVariety = 'egyptian' | 'gulf' | 'levantine' | 'maghrebi';

export interface HeldOutLine {
  text: string;
  variety: HeldOutVariety;
  expect: GoldenLine['expect'];
  /** The due date the first suggestion should carry, as YYYY-MM-DD, or null for none. */
  due?: string | null;
}

export const HELD_OUT_ARABIC: HeldOutLine[] = [
  // ---- Egyptian: commitments
  {
    text: 'هعدي عليك بكره بالليل اخد الشنطة',
    variety: 'egyptian',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: 'حاضر هبعتلك الملف أول ما اوصل المكتب',
    variety: 'egyptian',
    expect: { commitment: true },
  },
  { text: 'انا هدفع الحساب المرة دي', variety: 'egyptian', expect: { commitment: true } },
  {
    text: 'هكلم المحامي يوم الخميس وارد عليك',
    variety: 'egyptian',
    expect: { commitment: true },
    due: '2026-10-08',
  },
  { text: 'خلاص هجيب التورتة وانا جاي', variety: 'egyptian', expect: { commitment: true } },
  {
    text: 'هحولك الفلوس النهارده بالليل',
    variety: 'egyptian',
    expect: { commitment: true },
    due: '2026-10-05',
  },
  {
    text: 'اوعدك مش هتأخر تاني وهخلص التقرير قبل الحد',
    variety: 'egyptian',
    expect: { commitment: true },
    due: '2026-10-11',
  },
  // ---- Egyptian: requests
  {
    text: 'ممكن تبعتلي صورة البطاقة؟',
    variety: 'egyptian',
    expect: { request: true, question: true },
  },
  {
    text: 'لو سمحت فكرني بالميعاد بكره الصبح',
    variety: 'egyptian',
    expect: { request: true },
    due: '2026-10-06',
  },
  { text: 'معلش ابقى هات معاك الشاحن', variety: 'egyptian', expect: { request: true } },
  {
    text: 'عايزك تراجع العقد قبل الاربع',
    variety: 'egyptian',
    expect: { request: true },
    due: '2026-10-07',
  },
  { text: 'متنساش تشتري عيش وانت راجع', variety: 'egyptian', expect: { request: true } },
  { text: 'اتصل بيا اول ما تخلص', variety: 'egyptian', expect: { request: true } },
  {
    text: 'ياريت تبعتلي الأسعار النهارده',
    variety: 'egyptian',
    expect: { request: true },
    due: '2026-10-05',
  },
  // ---- Egyptian: questions
  { text: 'انت فين دلوقتي؟', variety: 'egyptian', expect: { question: true } },
  { text: 'الاجتماع الساعة كام', variety: 'egyptian', expect: { question: true } },
  { text: 'ليه مردتش عليا امبارح؟', variety: 'egyptian', expect: { question: true } },
  { text: 'هو المطعم ده فاتح يوم الجمعة؟', variety: 'egyptian', expect: { question: true } },
  { text: 'عامل ايه في الشغل الجديد؟', variety: 'egyptian', expect: { question: true } },
  { text: 'مين اللي هيوصل الولاد؟', variety: 'egyptian', expect: { question: true } },
  // ---- Egyptian: decisions
  { text: 'خلاص اتفقنا نتقابل عند الكافيه', variety: 'egyptian', expect: { decision: true } },
  { text: 'قررنا نسافر اسكندرية بدل الساحل', variety: 'egyptian', expect: { decision: true } },
  { text: 'استقرينا على اللون البيج للصالة', variety: 'egyptian', expect: { decision: true } },
  { text: 'يبقى نمشي على الاقتراح التاني', variety: 'egyptian', expect: { decision: true } },
  { text: 'اتفقنا على ٣٠٠٠ جنيه في الشهر', variety: 'egyptian', expect: { decision: true } },
  { text: 'حسمناها: الفرح في نوفمبر', variety: 'egyptian', expect: { decision: true } },
  // ---- Egyptian: none of them
  { text: 'ربنا يخليك يا حبيبي', variety: 'egyptian', expect: {} },
  { text: 'مش هقدر اجي النهارده للأسف', variety: 'egyptian', expect: {} },
  { text: 'اخويا هيعدي عليك بكره', variety: 'egyptian', expect: {} },
  { text: 'كنت ناوي ابعتلك بس الدنيا اتلخبطت', variety: 'egyptian', expect: {} },
  { text: 'ممكن الدنيا تمطر بكره', variety: 'egyptian', expect: {} },
  { text: 'قالي هبعتلك الفلوس ومبعتش', variety: 'egyptian', expect: {} },
  { text: 'ماشي يا عم', variety: 'egyptian', expect: {} },
  { text: 'لسه مقررناش حاجة', variety: 'egyptian', expect: {} },
  { text: 'مش موافق خالص على الكلام ده', variety: 'egyptian', expect: {} },
  { text: 'ياااه فين ايامك', variety: 'egyptian', expect: {} },
  { text: 'كل سنة وانت طيب 🎉', variety: 'egyptian', expect: {} },
  { text: 'لو فاضي ممكن نتكلم بالليل', variety: 'egyptian', expect: {} },
  { text: 'حلو اوي الكلام ده', variety: 'egyptian', expect: {} },

  // ---- Gulf: commitments
  {
    text: 'أبشر، برسل لك العرض باكر الصبح',
    variety: 'gulf',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  { text: 'بمر عليك عقب الدوام', variety: 'gulf', expect: { commitment: true } },
  {
    text: 'إن شاء الله بحول لك المبلغ اليوم',
    variety: 'gulf',
    expect: { commitment: true },
    due: '2026-10-05',
  },
  { text: 'راح أكلم المورد الحين وأرد عليك', variety: 'gulf', expect: { commitment: true } },
  {
    text: 'بخلص التقرير قبل الخميس بإذن الله',
    variety: 'gulf',
    expect: { commitment: true },
    due: '2026-10-08',
  },
  {
    text: 'من عيوني، بجيب لك الأوراق يوم الأحد',
    variety: 'gulf',
    expect: { commitment: true },
    due: '2026-10-11',
  },
  { text: 'باچر أدز لك الصور', variety: 'gulf', expect: { commitment: true }, due: '2026-10-06' },
  // ---- Gulf: requests
  { text: 'تكفى أرسل لي رقم المكتب', variety: 'gulf', expect: { request: true } },
  {
    text: 'لو سمحت ذكرني بالاجتماع باكر',
    variety: 'gulf',
    expect: { request: true },
    due: '2026-10-06',
  },
  {
    text: 'تقدر تحجز لنا طاولة الخميس؟',
    variety: 'gulf',
    expect: { request: true, question: true },
    due: '2026-10-08',
  },
  { text: 'الله يعافيك دز لي الفاتورة', variety: 'gulf', expect: { request: true } },
  { text: 'أبيك تراجع العقد قبل نوقعه', variety: 'gulf', expect: { request: true } },
  { text: 'لا تنسى تجيب الشاحن معك', variety: 'gulf', expect: { request: true } },
  { text: 'عطني رقم الفني إذا عندك', variety: 'gulf', expect: { request: true } },
  // ---- Gulf: questions
  { text: 'متى توصل؟', variety: 'gulf', expect: { question: true } },
  { text: 'وش صار على الطلب؟', variety: 'gulf', expect: { question: true } },
  { text: 'شلونك اليوم؟', variety: 'gulf', expect: { question: true } },
  { text: 'وين نتقابل', variety: 'gulf', expect: { question: true } },
  { text: 'كم سعر الغرفة بالليلة؟', variety: 'gulf', expect: { question: true } },
  { text: 'ليش ما رديت علي؟', variety: 'gulf', expect: { question: true } },
  // ---- Gulf: decisions
  { text: 'تم، اتفقنا على موعد الأحد', variety: 'gulf', expect: { decision: true } },
  { text: 'قررنا نأجل السفرة للشهر الياي', variety: 'gulf', expect: { decision: true } },
  { text: 'خلاص نعتمد العرض الأول', variety: 'gulf', expect: { decision: true } },
  { text: 'اعتمدت الإدارة الميزانية', variety: 'gulf', expect: { decision: true } },
  {
    text: 'استقر الرأي على الفندق اللي قريب من البحر',
    variety: 'gulf',
    expect: { decision: true },
  },
  { text: 'اتفقنا يكون الاجتماع أونلاين', variety: 'gulf', expect: { decision: true } },
  // ---- Gulf: none of them
  { text: 'الله يعطيك العافية', variety: 'gulf', expect: {} },
  { text: 'ما أقدر أجي اليوم', variety: 'gulf', expect: {} },
  { text: 'أخوي بيجيب السيارة باكر', variety: 'gulf', expect: {} },
  { text: 'مب لازم ترسلها الحين', variety: 'gulf', expect: {} },
  { text: 'يمكن أتأخر شوي', variety: 'gulf', expect: {} },
  { text: 'قال برسلها بس للحين ما وصل شي', variety: 'gulf', expect: {} },
  { text: 'هلا والله', variety: 'gulf', expect: {} },
  { text: 'للحين ما قررنا', variety: 'gulf', expect: {} },
  { text: 'مو موافق على هالسعر', variety: 'gulf', expect: {} },
  { text: 'يا حلو هالصورة', variety: 'gulf', expect: {} },
  { text: 'ما عليك زود', variety: 'gulf', expect: {} },
  { text: 'تم', variety: 'gulf', expect: {} },
  { text: 'زين، الله يوفقك', variety: 'gulf', expect: {} },

  // ---- Levantine: commitments
  {
    text: 'رح ابعتلك العقد بكرا الصبح',
    variety: 'levantine',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  { text: 'بمرق عليك بعد الشغل', variety: 'levantine', expect: { commitment: true } },
  {
    text: 'ولا يهمك، بحكي مع صاحب البيت اليوم',
    variety: 'levantine',
    expect: { commitment: true },
    due: '2026-10-05',
  },
  {
    text: 'حخلص الشغل قبل الجمعة',
    variety: 'levantine',
    expect: { commitment: true },
    due: '2026-10-09',
  },
  { text: 'رح جيب الأغراض وأنا جاي', variety: 'levantine', expect: { commitment: true } },
  {
    text: 'بدي ادفعلك حقك يوم السبت',
    variety: 'levantine',
    expect: { commitment: true },
    due: '2026-10-10',
  },
  { text: 'تكرم عينك، ببعتلك الصور بس وصل', variety: 'levantine', expect: { commitment: true } },
  // ---- Levantine: requests
  {
    text: 'فيك تبعتلي العنوان؟',
    variety: 'levantine',
    expect: { request: true, question: true },
  },
  {
    text: 'دخيلك ذكرني بالموعد بكرا',
    variety: 'levantine',
    expect: { request: true },
    due: '2026-10-06',
  },
  { text: 'ما تنسى تجيب الخبز', variety: 'levantine', expect: { request: true } },
  { text: 'اذا بتريد احجزلنا طاولة لأربعة', variety: 'levantine', expect: { request: true } },
  {
    text: 'بدي ياك تراجع الملف قبل الخميس',
    variety: 'levantine',
    expect: { request: true },
    due: '2026-10-08',
  },
  { text: 'احكيني لما توصل', variety: 'levantine', expect: { request: true } },
  {
    text: 'ممكن تبعتلي الفاتورة اليوم؟',
    variety: 'levantine',
    expect: { request: true, question: true },
    due: '2026-10-05',
  },
  // ---- Levantine: questions
  { text: 'وينك؟', variety: 'levantine', expect: { question: true } },
  { text: 'إيمتى بلش الاجتماع؟', variety: 'levantine', expect: { question: true } },
  { text: 'قديش بدك حق الشغلة؟', variety: 'levantine', expect: { question: true } },
  { text: 'شو صار مع الدكتور؟', variety: 'levantine', expect: { question: true } },
  { text: 'كيفك اليوم', variety: 'levantine', expect: { question: true } },
  { text: 'مين جاي معنا بكرا؟', variety: 'levantine', expect: { question: true } },
  // ---- Levantine: decisions
  { text: 'خلص اتفقنا، منلتقى عند المطعم', variety: 'levantine', expect: { decision: true } },
  { text: 'قررنا نأجل العرس لبعد الصيف', variety: 'levantine', expect: { decision: true } },
  { text: 'منمشي عالخطة التانية', variety: 'levantine', expect: { decision: true } },
  { text: 'اتفقنا عالسعر النهائي', variety: 'levantine', expect: { decision: true } },
  { text: 'استقرّينا عالشقة يلي بالأشرفية', variety: 'levantine', expect: { decision: true } },
  { text: 'تمام هيك، منعمل الحفلة عندي', variety: 'levantine', expect: { decision: true } },
  // ---- Levantine: none of them
  { text: 'يسلمو ايديك', variety: 'levantine', expect: {} },
  { text: 'ما رح اقدر اجي بكرا', variety: 'levantine', expect: {} },
  { text: 'اختي رح تبعتلك الصور', variety: 'levantine', expect: {} },
  { text: 'رح تشتي بكرا', variety: 'levantine', expect: {} },
  { text: 'كنت بدي اتصل فيك بس نسيت', variety: 'levantine', expect: {} },
  { text: 'قلي رح ادفع وما دفع', variety: 'levantine', expect: {} },
  { text: 'الله يعطيك العافية', variety: 'levantine', expect: {} },
  { text: 'لسا ما قررنا شي', variety: 'levantine', expect: {} },
  { text: 'مش موافق عهيك حكي', variety: 'levantine', expect: {} },
  { text: 'شو هالحلاوة!', variety: 'levantine', expect: {} },
  { text: 'يمكن نطلع سوا الويكند', variety: 'levantine', expect: {} },
  { text: 'ليش لأ', variety: 'levantine', expect: {} },
  { text: 'منيح كتير هيك', variety: 'levantine', expect: {} },

  // ---- Maghrebi: commitments
  {
    text: 'غادي نصيفط ليك الملف غدا الصباح',
    variety: 'maghrebi',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  { text: 'غانجي عندك من بعد الخدمة', variety: 'maghrebi', expect: { commitment: true } },
  {
    text: 'نخلصك نهار السبت إن شاء الله',
    variety: 'maghrebi',
    expect: { commitment: true },
    due: '2026-10-10',
  },
  { text: 'باش نبعثلك الصور توا', variety: 'maghrebi', expect: { commitment: true } },
  {
    text: 'راني نبعثلك الفاتورة غدوة',
    variety: 'maghrebi',
    expect: { commitment: true },
    due: '2026-10-06',
  },
  {
    text: 'غادي نعيط ليك نهار الخميس',
    variety: 'maghrebi',
    expect: { commitment: true },
    due: '2026-10-08',
  },
  { text: 'نجيب معايا الكيكة', variety: 'maghrebi', expect: { commitment: true } },
  // ---- Maghrebi: requests
  { text: 'عافاك صيفط ليا اللوكاسيون', variety: 'maghrebi', expect: { request: true } },
  { text: 'الله يخليك عيط ليا ملي توصل', variety: 'maghrebi', expect: { request: true } },
  {
    text: 'تقدر تبعثلي الوثائق اليوم؟',
    variety: 'maghrebi',
    expect: { request: true, question: true },
    due: '2026-10-05',
  },
  { text: 'ما تنساش تجيب الخبز', variety: 'maghrebi', expect: { request: true } },
  {
    text: 'فكرني بالموعد غدا',
    variety: 'maghrebi',
    expect: { request: true },
    due: '2026-10-06',
  },
  { text: 'يعيشك ابعثلي النسخة الجديدة', variety: 'maghrebi', expect: { request: true } },
  {
    text: 'بغيتك تراجع العقد قبل نهار الجمعة',
    variety: 'maghrebi',
    expect: { request: true },
    due: '2026-10-09',
  },
  // ---- Maghrebi: questions
  { text: 'فوقاش غادي توصل؟', variety: 'maghrebi', expect: { question: true } },
  { text: 'فين نتلاقاو؟', variety: 'maghrebi', expect: { question: true } },
  { text: 'شحال الثمن؟', variety: 'maghrebi', expect: { question: true } },
  { text: 'علاش ما جاوبتينيش؟', variety: 'maghrebi', expect: { question: true } },
  { text: 'واش كلشي مزيان؟', variety: 'maghrebi', expect: { question: true } },
  { text: 'وقتاش الاجتماع', variety: 'maghrebi', expect: { question: true } },
  // ---- Maghrebi: decisions
  { text: 'صافي تفاهمنا، نتلاقاو فالقهوة', variety: 'maghrebi', expect: { decision: true } },
  { text: 'قررنا نأجلو السفر', variety: 'maghrebi', expect: { decision: true } },
  { text: 'اتفقنا على الثمن', variety: 'maghrebi', expect: { decision: true } },
  {
    text: 'غادي نمشيو مع العرض الأول، هادشي لي تفاهمنا عليه',
    variety: 'maghrebi',
    expect: { decision: true },
  },
  { text: 'خترنا الشقة لي قريبة للخدمة', variety: 'maghrebi', expect: { decision: true } },
  { text: 'خلاص، العرس يكون في الصيف', variety: 'maghrebi', expect: { decision: true } },
  // ---- Maghrebi: none of them
  { text: 'الله يحفظك', variety: 'maghrebi', expect: {} },
  { text: 'ما نقدرش نجي اليوم', variety: 'maghrebi', expect: {} },
  { text: 'خويا غادي يجيب الطوموبيل غدا', variety: 'maghrebi', expect: {} },
  { text: 'يمكن نتعطل شوية', variety: 'maghrebi', expect: {} },
  { text: 'كنت باغي نعيط ليك ونسيت', variety: 'maghrebi', expect: {} },
  { text: 'قال ليا غادي يخلص وما خلصش', variety: 'maghrebi', expect: {} },
  { text: 'مرسي بزاف', variety: 'maghrebi', expect: {} },
  { text: 'مازال ما قررناش', variety: 'maghrebi', expect: {} },
  { text: 'ماشي متافق مع هاد الثمن', variety: 'maghrebi', expect: {} },
  { text: 'صحة ليك', variety: 'maghrebi', expect: {} },
  { text: 'بصحتك', variety: 'maghrebi', expect: {} },
  { text: 'ماشي دابا', variety: 'maghrebi', expect: {} },
  { text: 'مزيان بزاف', variety: 'maghrebi', expect: {} },
];
