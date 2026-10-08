import { describe, expect, it } from 'vitest';
import { chatIntent, greetsWithPeace, writtenIn } from './chat-intent';

const each = (cases: Array<[string, ReturnType<typeof chatIntent>]>) => {
  for (const [text, intent] of cases) expect([text, chatIntent(text)]).toEqual([text, intent]);
};

describe('what a message to Cai or a friend asks (R67, R71)', () => {
  it('reads the four questions about one’s own open things, in four languages', () => {
    each([
      ['What am I waiting for?', 'waiting'],
      ['who owes me', 'waiting'],
      ['Who is waiting on me?', 'asked'],
      ['what was asked of me', 'asked'],
      ['My tasks', 'mine'],
      ['what did I promise?', 'mine'],
      ['What’s coming up?', 'coming'],
      ['what do I have tomorrow', 'coming'],
      ['من ينتظرني؟', 'asked'],
      ['ماذا أنتظر؟', 'waiting'],
      ['ما هي مهامي', 'mine'],
      ['ماذا لدي اليوم؟', 'coming'],
      ['انا مستني ايه؟', 'waiting'],
      ['عندي ايه بكره', 'coming'],
      ['Qui m’attend ?', 'asked'],
      ['qu’est-ce que j’attends', 'waiting'],
      ['mes tâches', 'mine'],
      ['qu’est-ce que j’ai demain ?', 'coming'],
      ['Beni kim bekliyor?', 'asked'],
      ['ne bekliyorum', 'waiting'],
      ['görevlerim', 'mine'],
      ['bugün ne var?', 'coming'],
    ]);
  });

  it('reads small talk as people type it: a greeting, “how can you help me”, thanks', () => {
    each([
      ['hi', 'greeting'],
      ['hello Caishy', 'greeting'],
      ['Good morning!', 'greeting'],
      ['السلام عليكم', 'greeting'],
      ['مرحبا يا Panda', 'greeting'],
      ['ازيك عامل ايه', 'greeting'],
      ['Bonjour Momo', 'greeting'],
      ['coucou', 'greeting'],
      ['Merhaba', 'greeting'],
      ['Selamün aleyküm', 'greeting'],
      ['What can you do?', 'help'],
      ['hi! how can you help me?', 'help'],
      ['who are you', 'help'],
      // Egyptian, spelled as typed: "ى" for "ي", "اذاى" for "ازاي".
      ['انت ممكن تساعدنى اذاى', 'help'],
      ['تقدر تساعدني ازاي؟', 'help'],
      ['مين انت', 'help'],
      ['Tu peux m’aider ?', 'help'],
      ['qu’est-ce que tu sais faire', 'help'],
      ['Bana nasıl yardım edebilirsin?', 'help'],
      ['ne yapabilirsin', 'help'],
      ['thanks!', 'thanks'],
      ['thank you so much Zuzu', 'thanks'],
      ['شكرا', 'thanks'],
      ['شكراً يا Lumi', 'thanks'],
      ['merci beaucoup', 'thanks'],
      ['teşekkürler', 'thanks'],
      ['sağ ol', 'thanks'],
    ]);
  });

  it('leaves anything wider to the model', () => {
    each([
      ['What should I do in Paris today?', null],
      ['I’m waiting for the bus, any ideas?', null],
      ['Write a toast for my sister’s wedding', null],
      ['hi, can you help me plan a trip next week?', null],
      ['What to do this weekend', null],
      ['ممكن تساعدني في ترتيب رحلة الأسبوع الجاي؟', null],
      ['merci, et tu connais un bon restaurant à Lyon ?', null],
      ['selam, bu akşam ne pişireyim?', null],
      ['', null],
    ]);
  });

  it('knows a greeting of peace, to answer it in kind', () => {
    expect(greetsWithPeace('السلام عليكم ورحمة الله')).toBe(true);
    expect(greetsWithPeace('Selamün aleyküm')).toBe(true);
    expect(greetsWithPeace('Salam alikoum')).toBe(true);
    expect(greetsWithPeace('مرحبا')).toBe(false);
    expect(greetsWithPeace('hello')).toBe(false);
  });
});

describe('the language a message is written in', () => {
  it('is Arabic by its letters, and French, Turkish or English by their words', () => {
    expect(writtenIn('انت ممكن تساعدنى اذاى')).toBe('ar');
    expect(writtenIn('السلام عليكم')).toBe('ar');
    expect(writtenIn('Bonjour, tu peux m’aider ?')).toBe('fr');
    expect(writtenIn('Merhaba, nasılsın?')).toBe('tr');
    expect(writtenIn('Hello, what can you do?')).toBe('en');
  });

  it('is nobody’s when the message doesn’t say', () => {
    expect(writtenIn('👍')).toBeNull();
    expect(writtenIn('ok')).toBeNull();
    expect(writtenIn('Caishy')).toBeNull();
    expect(writtenIn('')).toBeNull();
  });
});
