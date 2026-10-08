import { describe, expect, it } from 'vitest';
import {
  analyzeMessage,
  detectEmergingTopic,
  extractAmounts,
  suggestFromAnalysis,
} from './intelligence';

const opts = {
  now: new Date('2026-09-23T14:00:00Z'),
  timeZone: 'America/New_York',
  locale: 'en-US',
};
const cairo = { now: new Date('2026-09-25T11:30:00Z'), timeZone: 'Africa/Cairo', locale: 'ar-EG' };
const sarah = { senderIsMe: false, senderName: 'Sarah' };
const me = { senderIsMe: true, senderName: 'You' };

describe('the PRD examples', () => {
  it('"I\'ll send the proposal tomorrow." from me → reminder (PRD §23)', () => {
    const a = analyzeMessage("I'll send the proposal tomorrow.", opts);
    expect(a.isCommitment).toBe(true);
    expect(a.commitment).toMatchObject({ title: 'Send proposal', object: 'Proposal' });
    const [s] = suggestFromAnalysis(a, me);
    expect(s).toMatchObject({ kind: 'reminder', title: 'Send proposal', dueText: 'tomorrow' });
    expect(s!.dueAt?.startsWith('2026-09-24')).toBe(true);
  });

  it('"I\'ll send you the contract tomorrow." from Sarah → Waiting for Sarah — Contract (PRD §29)', () => {
    const a = analyzeMessage("I'll send you the contract tomorrow.", opts);
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Contract', dueText: 'tomorrow' });
    expect(s!.rationale).toContain('Sarah wrote');
  });

  it('"Can you send me the document tomorrow?" → a task for me (PRD P1)', () => {
    const a = analyzeMessage('Can you send me the document tomorrow?', opts);
    expect(a).toMatchObject({ isQuestion: true, isRequest: true, mode: 'request' });
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'task', title: 'Send document', dueText: 'tomorrow' });
  });

  it('the same request sent by me → I am waiting', () => {
    const a = analyzeMessage('Could you send me the contract by Friday?', opts);
    const [s] = suggestFromAnalysis(a, me);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Contract', dueText: 'by Friday' });
  });

  it('waiting on something that isn’t handed over keeps what they’ll do with it', () => {
    // "Caterer" alone would read as waiting on the caterer.
    const theirs = suggestFromAnalysis(analyzeMessage('I’ll confirm the caterer.', opts), sarah);
    expect(theirs[0]).toMatchObject({ kind: 'waiting', title: 'Confirm caterer', vague: false });
    const mine = suggestFromAnalysis(analyzeMessage('Could you book the venue?', opts), me);
    expect(mine[0]).toMatchObject({ kind: 'waiting', title: 'Book venue' });
    // Handed-over things are still named by the thing.
    const sent = suggestFromAnalysis(analyzeMessage('I’ll share the slides tonight.', opts), sarah);
    expect(sent[0]).toMatchObject({ kind: 'waiting', title: 'Slides' });
  });

  it('"Approved the final design." → a decision (PRD §30)', () => {
    const a = analyzeMessage('Approved the final design.', opts);
    expect(a.mode).toBe('decide');
    expect(a.decision?.title).toBe('Approved the final design');
  });
});

describe('decisions', () => {
  it.each([
    ['We decided to go with vendor B.', 'Go with vendor B'],
    ["Ok let's go with option 2", 'Go with option 2'],
    ['We agreed on the October launch.', 'Agreed on the October launch'],
    ['اتفقنا على السعر', 'اتفقنا على السعر'],
  ])('%s', (text, title) => {
    expect(analyzeMessage(text, opts).decision?.title).toBe(title);
  });
});

describe('what is not a commitment or a request', () => {
  it.each([
    "I won't be able to send it",
    "I'll be there at 5",
    'I will not make it',
    'Thanks, that was great.',
  ])('%s', (text) => {
    const a = analyzeMessage(text, opts);
    expect(a.isCommitment).toBe(false);
    expect(a.isRequest).toBe(false);
  });

  it('a plain question is not a request', () => {
    const a = analyzeMessage('What time is the meeting?', opts);
    expect(a).toMatchObject({ isQuestion: true, isRequest: false, mode: 'ask' });
  });
});

describe('imperatives and modes', () => {
  it('an imperative with a date is a request', () => {
    const [s] = suggestFromAnalysis(analyzeMessage('Send me the file by Friday.', opts), sarah);
    expect(s).toMatchObject({ kind: 'task', title: 'Send file' });
  });

  it('a verb and only a number is a label, not something to do', () => {
    expect(analyzeMessage('Update 55', opts).isRequest).toBe(false);
    expect(suggestFromAnalysis(analyzeMessage('Update 55', opts), me)).toEqual([]);
    const [deck] = suggestFromAnalysis(analyzeMessage('Update the deck by Friday', opts), sarah);
    expect(deck).toMatchObject({ kind: 'task', title: 'Update deck' });
    expect(analyzeMessage('Send 2 copies to Sarah', opts).isRequest).toBe(true);
  });

  it('get back to you → waiting for a reply', () => {
    const [s] = suggestFromAnalysis(analyzeMessage("I'll get back to you on Monday", opts), sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Reply' });
  });

  it('confirmations, plans, links, payments and tracking', () => {
    expect(analyzeMessage('Sounds good', opts).mode).toBe('confirm');
    expect(analyzeMessage("Let's meet Tuesday at 10", opts).mode).toBe('plan');
    expect(analyzeMessage('Here is the doc https://example.com/doc.', opts).links[0]?.host).toBe(
      'example.com',
    );
    const pay = analyzeMessage('Invoice #4821 for $1,200.50 is due Oct 15', opts);
    expect(pay.mode).toBe('pay');
    expect(pay.refs).toContain('#4821');
    expect(pay.amounts[0]).toMatchObject({ value: 1200.5, currency: 'USD' });
    const track = analyzeMessage(
      'Your parcel is out for delivery, tracking 1Z999AA10123456784',
      opts,
    );
    expect(track.mode).toBe('track');
    expect(track.refs).toContain('1Z999AA10123456784');
  });
});

describe('amounts', () => {
  it.each([
    ['EGP 5,000', 5000, 'EGP'],
    ['5k EGP', 5000, 'EGP'],
    ['€1.200,50', 1200.5, 'EUR'],
    ['250 جنيه', 250, 'EGP'],
    ['£20', 20, 'GBP'],
    ['100 dollars', 100, 'USD'],
  ])('%s', (text, value, currency) => {
    expect(extractAmounts(text)[0]).toMatchObject({ value, currency });
  });
});

describe('Arabic', () => {
  it('Egyptian commitment → waiting with the object', () => {
    const a = analyzeMessage('هبعتلك العقد بكرة', cairo);
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'العقد', dueText: 'بكرة' });
  });

  it('polite request that is also a question', () => {
    const a = analyzeMessage('ممكن تبعتلي الملف النهارده؟', cairo);
    expect(a.isQuestion).toBe(true);
    expect(a.isRequest).toBe(true);
    expect(suggestFromAnalysis(a, sarah)[0]).toMatchObject({ kind: 'task', dueText: 'النهارده' });
  });

  it('question words without a question mark', () => {
    expect(analyzeMessage('امتى الاجتماع', cairo).isQuestion).toBe(true);
  });

  const riyadh = { ...cairo, timeZone: 'Asia/Riyadh', locale: 'ar-SA' };
  const beirut = { ...cairo, timeZone: 'Asia/Beirut', locale: 'ar-LB' };

  describe('commitments in Gulf, Levantine and MSA phrasing', () => {
    it.each([
      ['راح أرسلك العقد بكرة', 'العقد', 'بكرة'],
      ['راح أرسل لك العرض الخميس', 'العرض', 'الخميس'],
      ['رح ابعتلك الصور بكرا', 'الصور', 'بكرا'],
      ['بكرا بعطيك الملف', 'الملف', 'بكرا'],
      ['سأرسل لك التقرير غداً', 'التقرير', 'غداً'],
      ['سوف أراجع العرض اليوم', 'العرض', 'اليوم'],
    ])('%s → waiting for %s', (text, title, dueText) => {
      const a = analyzeMessage(text, riyadh);
      expect(a.isCommitment).toBe(true);
      const [s] = suggestFromAnalysis(a, sarah);
      expect(s).toMatchObject({ kind: 'waiting', title, dueText, vague: false });
    });

    it('my own promise is a reminder with the whole clause', () => {
      const [s] = suggestFromAnalysis(analyzeMessage('رح ابعتلك الصور بكرا', beirut), me);
      expect(s).toMatchObject({ kind: 'reminder', title: 'رح ابعتلك الصور', dueText: 'بكرا' });
    });

    it.each(['مش هبعت العقد بكرة', 'ما راح أقدر أرسل العقد', 'ما رح اقدر ابعتلك', 'لن أرسل العقد'])(
      'a promise taken back is none: %s',
      (text) => {
        const a = analyzeMessage(text, riyadh);
        expect(a.isCommitment).toBe(false);
        expect(a.isQuestion).toBe(false);
        expect(suggestFromAnalysis(a, sarah)).toEqual([]);
      },
    );

    it('"راح" as "went" promises nothing', () => {
      expect(analyzeMessage('راح البيت من ساعة', riyadh).isCommitment).toBe(false);
    });
  });

  describe('requests in Gulf, Levantine and MSA phrasing', () => {
    it.each([
      ['تقدر ترسل لي العقد اليوم؟', 'ترسل لي العقد', 'العقد', 'اليوم'],
      ['فيك تبعتلي الملف بكرا؟', 'تبعتلي الملف', 'الملف', 'بكرا'],
      ['لو تكرمت ارسل لي الفاتورة', 'ارسل لي الفاتورة', 'الفاتورة', null],
      ['إذا ممكن تحول المبلغ قبل الخميس', 'تحول المبلغ', 'المبلغ', 'الخميس'],
      ['أبغاك تراجع العرض', 'تراجع العرض', 'العرض', null],
      ['بدي ياك تبعتلي العنوان', 'تبعتلي العنوان', 'العنوان', null],
      ['عطني رقم الحساب لو سمحت', 'عطني رقم الحساب', 'رقم الحساب', null],
      ['طرشلي الموقع', 'طرشلي الموقع', 'الموقع', null],
      ['أرجو إرسال العقد الموقع', 'إرسال العقد الموقع', 'العقد الموقع', null],
    ])('%s → a task for me', (text, title, object, dueText) => {
      const a = analyzeMessage(text, riyadh);
      expect(a.isRequest).toBe(true);
      expect(a.request).toMatchObject({ title, object });
      const [s] = suggestFromAnalysis(a, sarah);
      expect(s).toMatchObject({ kind: 'task', title, dueText });
    });

    it('the same request sent by me → waiting for the thing', () => {
      const [s] = suggestFromAnalysis(analyzeMessage('تقدر ترسل لي العقد اليوم؟', riyadh), me);
      expect(s).toMatchObject({ kind: 'waiting', title: 'العقد', dueText: 'اليوم' });
    });
  });

  describe('decisions', () => {
    it.each([
      ['خلاص نمشي على العرض الثاني', 'نمشي على العرض الثاني'],
      ['طيب، نعتمد التصميم الأخير', 'نعتمد التصميم الأخير'],
      ['اتفقنا نبدأ الأحد', 'اتفقنا نبدأ الأحد'],
      ['القرار إننا نأجل الإطلاق', 'القرار إننا نأجل الإطلاق'],
      ['تمت الموافقة على الميزانية', 'تمت الموافقة على الميزانية'],
    ])('%s', (text, title) => {
      const a = analyzeMessage(text, riyadh);
      expect(a.mode).toBe('decide');
      expect(a.decision?.title).toBe(title);
      expect(suggestFromAnalysis(a, sarah)[0]).toMatchObject({ kind: 'decision', title });
    });
  });

  describe('questions, confirmations and money', () => {
    it.each(['وين الاجتماع', 'شو رأيك بالعرض', 'ليش ما رديت', 'بكم العرض', 'شلون الشغل'])(
      'a question: %s',
      (text) => {
        expect(analyzeMessage(text, riyadh)).toMatchObject({ isQuestion: true, mode: 'ask' });
      },
    );
    it.each(['أبشر', 'خلاص تمام', 'زين', 'من عيوني', 'اوكي ماشي.'])('a yes: %s', (text) => {
      expect(analyzeMessage(text, riyadh)).toMatchObject({ isConfirmation: true, mode: 'confirm' });
    });
    it('a transfer with an amount is about paying', () => {
      const a = analyzeMessage('حولت لك المبلغ، ٥٠٠ ريال', riyadh);
      expect(a.mode).toBe('pay');
      expect(a.amounts[0]).toMatchObject({ value: 500, currency: 'SAR', text: '٥٠٠ ريال' });
    });
  });

  describe('amounts as Arabic writes them', () => {
    it.each([
      ['٥ آلاف ريال', 5000, 'SAR'],
      ['250 ر.س', 250, 'SAR'],
      ['2 مليون دينار كويتي', 2_000_000, 'KWD'],
      ['٣٠٠ درهم', 300, 'AED'],
      ['1,200 ريال قطري', 1200, 'QAR'],
      ['3 ألف جنيه', 3000, 'EGP'],
      ['المبلغ 750 جنيه مصري', 750, 'EGP'],
      ['20 شيكل', 20, 'ILS'],
      ['٤٥ دينار أردني', 45, 'JOD'],
      ['١٠٠ جنيه استرليني', 100, 'GBP'],
    ])('%s', (text, value, currency) => {
      const [a] = extractAmounts(text);
      expect(a).toMatchObject({ value, currency });
      expect(text).toContain(a!.text);
    });

    it('a currency word that names several currencies says none', () => {
      expect(extractAmounts('50 دينار')[0]).toMatchObject({ value: 50, currency: null });
      expect(extractAmounts('100 ليرة')[0]).toMatchObject({ value: 100, currency: null });
    });

    it('two currencies in one message', () => {
      expect(extractAmounts('$40 و 300 ريال').map((a) => a.currency)).toEqual(['USD', 'SAR']);
    });
  });
});

// Wednesday 16:00 in Paris, 17:00 in Istanbul.
const paris = { now: opts.now, timeZone: 'Europe/Paris', locale: 'fr-FR' };
const istanbul = { now: opts.now, timeZone: 'Europe/Istanbul', locale: 'tr-TR' };

describe('French', () => {
  it.each([
    ["Je t'envoie le contrat demain", 'Envoyer le contrat', 'Contrat', 'demain'],
    ['Je vais vous envoyer le devis vendredi', 'Envoyer le devis', 'Devis', 'vendredi'],
    ["J'enverrai les photos ce soir", 'Envoyer les photos', 'Photos', 'ce soir'],
    ['On va réserver la salle pour jeudi', 'Réserver la salle', 'Salle', 'pour jeudi'],
    ["J'vais faire le virement lundi", 'Faire le virement', 'Virement', 'lundi'],
    ["Je m'occupe de la réservation", "S'occuper de la réservation", 'Réservation', null],
  ])('a promise: %s', (text, title, object, dueText) => {
    const a = analyzeMessage(text, paris);
    expect(a.commitment).toMatchObject({ title, object });
    expect(suggestFromAnalysis(a, me)[0]).toMatchObject({ kind: 'reminder', title, dueText });
  });

  it('their promise of a thing handed over waits on the thing; one that points is vague', () => {
    const [sent] = suggestFromAnalysis(
      analyzeMessage("Je t'envoie le contrat demain", paris),
      sarah,
    );
    expect(sent).toMatchObject({ kind: 'waiting', title: 'Contrat', vague: false });
    const pointed = analyzeMessage("Je vais te l'envoyer jeudi", paris);
    expect(pointed.commitment).toMatchObject({ title: "Te l'envoyer", object: null });
    expect(suggestFromAnalysis(pointed, sarah)[0]).toMatchObject({ vague: true, dueText: 'jeudi' });
    expect(analyzeMessage("Je m'en occupe", paris).commitment?.title).toBe("S'en occuper");
  });

  it.each([
    "Je ne vais pas l'envoyer",
    'Je vais pas pouvoir venir',
    "J'enverrai pas le contrat",
    'Je vais bien, merci',
    'Je vais essayer de passer',
    'Je vous envoie ci-joint le devis',
    "Je te confirme que c'est bon",
    "Paul va t'envoyer le contrat",
  ])('no promise: %s', (text) => {
    expect(analyzeMessage(text, paris).isCommitment).toBe(false);
  });

  it.each([
    ["Tu peux m'envoyer le contrat demain ?", 'Envoyer le contrat', 'Contrat', 'demain'],
    ['Merci de signer le formulaire', 'Signer le formulaire', 'Formulaire', null],
    ["Envoie-moi l'adresse stp", "Envoyer l'adresse", 'Adresse', null],
    ['Il faut que tu appelles le plombier', 'Appeler le plombier', 'Plombier', null],
    ["N'oubliez pas de réserver la salle", 'Réserver la salle', 'Salle', null],
    ['Rappelle-moi ce soir', 'Me rappeler', null, 'ce soir'],
  ])('an ask: %s', (text, title, object, dueText) => {
    const a = analyzeMessage(text, paris);
    expect(a.request).toMatchObject({ title, object });
    expect(suggestFromAnalysis(a, sarah)[0]).toMatchObject({ kind: 'task', title, dueText });
  });

  it.each([
    'Tu peux pas savoir comme je suis contente',
    'Merci de ta réponse',
    'Tu peux venir quand tu veux',
    'Passe une bonne soirée',
    "S'il te plaît non",
  ])('no ask: %s', (text) => {
    expect(analyzeMessage(text, paris).isRequest).toBe(false);
  });

  it.each([
    ['On a décidé de partir avec le fournisseur B.', 'Partir avec le fournisseur B'],
    ["Bon, on part sur l'option 2", "On part sur l'option 2"],
    ["C'est validé", "C'est validé"],
  ])('a decision: %s', (text, title) => {
    const a = analyzeMessage(text, paris);
    expect(a.mode).toBe('decide');
    expect(a.decision?.title).toBe(title);
  });

  it.each([
    "Ce n'est pas encore validé",
    "Si on part sur l'option 2, il faut prévenir Paul",
    'On a validé ?',
  ])('no decision: %s', (text) => {
    expect(analyzeMessage(text, paris).isDecision).toBe(false);
  });

  it.each([
    'Est-ce que la réunion est confirmée',
    'Peux-tu regarder le devis',
    'Où est le dossier',
  ])('a question without its mark: %s', (text) => {
    expect(analyzeMessage(text, paris).isQuestion).toBe(true);
  });
  it.each(['Qui vivra verra', 'Quelle chance', 'Pourquoi pas'])('no question: %s', (text) => {
    expect(analyzeMessage(text, paris).isQuestion).toBe(false);
  });

  it('a yes, money, a parcel and a plan', () => {
    for (const yes of ["D'accord", 'Ça marche', "C'est noté, merci"])
      expect(analyzeMessage(yes, paris)).toMatchObject({ isConfirmation: true, mode: 'confirm' });
    const paid = analyzeMessage("J'ai payé la facture : 1 250,50 €", paris);
    expect(paid.mode).toBe('pay');
    expect(paid.amounts[0]).toMatchObject({ value: 1250.5, currency: 'EUR' });
    expect(analyzeMessage('Le colis a été expédié', paris).mode).toBe('track');
    expect(analyzeMessage('Réunion lundi à 15h', paris).mode).toBe('plan');
  });
});

describe('Turkish', () => {
  it.each([
    ['Yarın sözleşmeyi göndereceğim', 'Sözleşmeyi göndereceğim', 'Sözleşmeyi', 'Yarın'],
    ['Faturayı cuma günü yollayacağım', 'Faturayı yollayacağım', 'Faturayı', 'cuma günü'],
    ['Raporu bu akşam hazırlayacağım', 'Raporu hazırlayacağım', 'Raporu', 'bu akşam'],
    ['Akşam seni ararım', 'Seni ararım', null, null],
  ])('a promise: %s', (text, title, object, dueText) => {
    const a = analyzeMessage(text, istanbul);
    expect(a.commitment).toMatchObject({ title, object });
    expect(suggestFromAnalysis(a, me)[0]).toMatchObject({ kind: 'reminder', title, dueText });
  });

  it('their promise of a thing handed over waits on the thing', () => {
    const [s] = suggestFromAnalysis(
      analyzeMessage('Yarın sözleşmeyi göndereceğim', istanbul),
      sarah,
    );
    expect(s).toMatchObject({ kind: 'waiting', title: 'Sözleşmeyi', vague: false });
    const handled = analyzeMessage('Ben hallederim', istanbul);
    expect(handled.commitment).toMatchObject({ title: 'Hallederim', object: null });
  });

  it.each([
    'Yarın göndermeyeceğim',
    'Bu hafta gönderemeyeceğim',
    'Göndermicem',
    'Ahmet yarın gönderecek',
    'Bakarız',
    'Teşekkür ederim',
    'Göndereceğim mi?',
  ])('no promise: %s', (text) => {
    expect(analyzeMessage(text, istanbul).isCommitment).toBe(false);
  });

  it.each([
    ['Sözleşmeyi yarın gönderebilir misin?', 'Sözleşmeyi gönder', 'Sözleşmeyi', 'yarın'],
    ['Lütfen faturayı cumaya kadar gönderin', 'Faturayı gönderin', 'Faturayı', 'cumaya kadar'],
    ['Bana dosyayı atar mısın', 'Dosyayı at', 'Dosyayı', null],
    ['Pasaportları getirmeyi unutma', 'Pasaportları getir', 'Pasaportları', null],
    ['Raporu kontrol eder misiniz', 'Raporu kontrol et', 'Raporu', null],
    ['Faturayı gönder', 'Faturayı gönder', 'Faturayı', null],
  ])('an ask: %s', (text, title, object, dueText) => {
    const a = analyzeMessage(text, istanbul);
    expect(a.request).toMatchObject({ title, object });
    expect(suggestFromAnalysis(a, sarah)[0]).toMatchObject({ kind: 'task', title, dueText });
  });

  it.each([
    'İnanabilir misin?',
    'Kahve ister misin?',
    'Rica ederim',
    'Bir ara görüşelim',
    'Bakar mısın?',
  ])('no ask: %s', (text) => {
    expect(analyzeMessage(text, istanbul).isRequest).toBe(false);
  });

  it.each([
    ['Tamam, ikinci teklifle devam ediyoruz', 'İkinci teklifle devam ediyoruz'],
    ['Fiyatta anlaştık', 'Fiyatta anlaştık'],
    ['Karar verdik: B planı', 'B planı'],
  ])('a decision: %s', (text, title) => {
    const a = analyzeMessage(text, istanbul);
    expect(a.mode).toBe('decide');
    expect(a.decision?.title).toBe(title);
  });

  it.each(['Henüz karar vermedik', 'Belki ikinci teklifle devam ediyoruz', 'Bütçe onaylandı mı?'])(
    'no decision: %s',
    (text) => {
      expect(analyzeMessage(text, istanbul).isDecision).toBe(false);
    },
  );

  it.each(['Toplantı ne zaman', 'Geldin mi', 'Fiyatı ne kadar'])(
    'a question without its mark: %s',
    (text) => {
      expect(analyzeMessage(text, istanbul).isQuestion).toBe(true);
    },
  );
  it.each(['Ne güzel', 'Kim bilir', 'Ne zaman istersen'])('no question: %s', (text) => {
    expect(analyzeMessage(text, istanbul).isQuestion).toBe(false);
  });

  it('a yes, money and a parcel', () => {
    for (const yes of ['Tamam', 'Olur', 'Tamamdır', 'Süper, teşekkürler'])
      expect(analyzeMessage(yes, istanbul)).toMatchObject({
        isConfirmation: true,
        mode: 'confirm',
      });
    const paid = analyzeMessage('Faturayı ödedim, 1.250,00 TL', istanbul);
    expect(paid.mode).toBe('pay');
    expect(paid.amounts[0]).toMatchObject({ value: 1250, currency: 'TRY' });
    expect(analyzeMessage('Kargoya verildi', istanbul).mode).toBe('track');
  });
});

describe('amounts in French and Turkish', () => {
  it.each([
    ['1 250,50 €', 1250.5, 'EUR'],
    ['3 mille euros', 3000, 'EUR'],
    ["1,5 million d'euros", 1_500_000, 'EUR'],
    ['200 dirhams marocains', 200, 'MAD'],
    ['250 TL', 250, 'TRY'],
    ['₺250', 250, 'TRY'],
    ['5 bin TL', 5000, 'TRY'],
    ['2 milyon TL', 2_000_000, 'TRY'],
    ['500 Türk lirası', 500, 'TRY'],
    ['Kirası 5 bin lira', 5000, 'TRY'],
  ])('%s', (text, value, currency) => {
    const [a] = extractAmounts(text);
    expect(a).toMatchObject({ value, currency });
    expect(text).toContain(a!.text);
  });

  it('a word that names several currencies says none', () => {
    expect(extractAmounts('50 balles')[0]).toMatchObject({ value: 50, currency: null });
    expect(extractAmounts('30 dinars')[0]).toMatchObject({ value: 30, currency: null });
    // "Lira" alone is Turkey's only among Turkish words.
    expect(extractAmounts('It cost 100 lira')[0]).toMatchObject({ value: 100, currency: null });
  });
});

describe('topics', () => {
  it('detects a topic that keeps coming up', () => {
    const recent = [
      'Project Alpha kickoff moved',
      'status of Project Alpha?',
      'lunch?',
      'Project Alpha budget is approved',
    ].map((t) => analyzeMessage(t, opts));
    expect(detectEmergingTopic(recent)).toBe('Project Alpha');
    expect(detectEmergingTopic(recent.slice(0, 2))).toBeNull();
  });
});

describe('suggestions from vague commitments', () => {
  it('names the person when they only point at the thing, and flags it for merging', () => {
    const a = analyzeMessage('Sure — I’ll send it Thursday.', opts);
    const [s] = suggestFromAnalysis(a, { senderIsMe: false, senderName: 'Sarah' });
    expect(s).toMatchObject({ kind: 'waiting', title: 'Sarah will send it', vague: true });
    expect(s?.dueText).toBe('Thursday');
    const named = suggestFromAnalysis(analyzeMessage("I'll send the proposal tomorrow.", opts), {
      senderIsMe: false,
      senderName: 'Sarah',
    });
    expect(named[0]).toMatchObject({ kind: 'waiting', vague: false });
    expect(named[0]?.title.toLowerCase()).toContain('proposal');
  });
});
