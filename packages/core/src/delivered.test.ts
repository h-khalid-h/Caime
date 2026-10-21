import { describe, expect, it } from 'vitest';
import { saysDelivered } from './delivered';

/** Lines written apart from the rules: what says it arrived, and the near-misses that don't. */
const LINES: Record<string, { yes: string[]; no: string[] }> = {
  en: {
    yes: [
      'Done!',
      'Sent',
      'All done',
      'I’ve sent it over',
      'I just sent the contract',
      'We have uploaded the files to the portal.',
      'It’s done, have a look when you can',
      'Here it is',
      'Here you go, the signed copy',
      'Please find attached the invoice',
      'See attached.',
      'I paid it this morning',
    ],
    no: [
      'Is it done?',
      'Not sent yet, sorry',
      'I haven’t sent it',
      'I’ll send it tomorrow',
      'It will be done by Friday',
      'Well done on the launch!',
      'Once it’s done I’ll tell you',
      'What’s done is done but we need a plan for next week',
      'I’m almost done with the draft and will send it later',
      'Can you send it?',
      'Sent from my iPhone? no idea what that means',
      'We still haven’t paid the deposit',
    ],
  },
  ar: {
    yes: [
      'تم',
      'تم الإرسال',
      'خلصت',
      'بعتلك الملف',
      'أرسلته لك الآن',
      'وأرسلت العقد',
      'هذا هو الملف المطلوب',
      'مرفق العرض',
      'حولت المبلغ الصبح',
      'اتبعت',
      'دفعت الفاتورة',
      'رفعته على الدرايف',
    ],
    no: [
      'خلصت؟',
      'لسه ما خلصت',
      'لم أرسله بعد',
      'هبعتهولك بكرة',
      'سوف أرسله غدا',
      'بمجرد ما تم التوقيع هقولك',
      'لما أخلص هبعتلك',
      'مش جاهز لسه',
      'هل تم الإرسال؟',
      'رح ابعتلك ياه بعدين',
      'إذا تم الدفع نبدأ',
      'ما بعتلك شي',
    ],
  },
  fr: {
    yes: [
      'C’est fait',
      'Fait !',
      'Envoyé',
      'Je vous ai envoyé le devis',
      'Je t’ai bien transmis le fichier',
      'Voici le contrat signé',
      'Ci-joint la facture',
      'Le document en pièce jointe',
      'Voilà',
      'On a payé ce matin',
      'J’ai déjà signé le bail',
      'Terminé !',
    ],
    no: [
      'C’est fait ?',
      'Pas encore envoyé',
      'Je vais l’envoyer demain',
      'En fait je n’ai pas le temps',
      'Tout à fait d’accord',
      'Je ne l’ai pas encore fini',
      'Dès que c’est fait je te dis',
      'Il sera envoyé ce soir',
      'Tu peux l’envoyer ?',
      'Si c’est fait tant mieux mais je n’ai rien reçu',
      'Je n’ai jamais payé ça',
      'Quand ce sera terminé, préviens-moi',
    ],
  },
  tr: {
    yes: [
      'Gönderdim',
      'Tamamdır',
      'Bitti',
      'Dosyayı yolladım',
      'Faturayı ekte bulabilirsiniz',
      'Ödedim',
      'Sözleşmeyi ilettim',
      'Hallettim',
      'Raporu tamamladım, bakabilirsin',
      'İşte burada',
      'Belgeleri yükledim',
      'Ekledim',
    ],
    no: [
      'Gönderdin mi?',
      'Henüz göndermedim',
      'Yarın göndereceğim',
      'Henüz bitmedi',
      'Bitince haber veririm',
      'Tamam mı?',
      'Eğer ödedim dersem yalan olur',
      'Daha yapmadım',
      'Sonra yollarım',
      'Ne zaman gönderdim ki?',
      'Göndermeyi unuttum',
      'Ödemeyi yarın yapacağım',
    ],
  },
};

describe('a message that says what was promised has arrived (M17 I2b)', () => {
  for (const [language, { yes, no }] of Object.entries(LINES)) {
    it(`in ${language}: every delivery read, no near-miss taken for one`, () => {
      expect(yes.filter((l) => !saysDelivered(l))).toEqual([]);
      expect(no.filter((l) => saysDelivered(l))).toEqual([]);
    });
  }

  it('a file or a link is a delivery whatever it says; a long letter is read as none', () => {
    expect(saysDelivered('', { files: 1 })).toBe(true);
    expect(saysDelivered('the draft', { links: 1 })).toBe(true);
    expect(saysDelivered(`Sent. ${'x'.repeat(500)}`)).toBe(false);
  });
});
