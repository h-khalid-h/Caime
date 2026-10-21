/**
 * Whether a message says that what was promised has arrived (M17 I2b, "nothing slips"): "sent",
 * "done", "here it is", "تم", "خلصت", "c'est fait", "ci-joint", "gönderdim", "tamamdır", read in
 * every interface language whatever the writer's. It only ever offers a "Done?" for an open wait
 * or promise in the same conversation (R12: never closed by itself), so it reads plainly: a
 * question ("is it done?"), a negation or a future in the same clause ("not sent yet", "لسه ما
 * خلصت", "pas encore envoyé", "henüz göndermedim", "I'll send it", "done by Friday") is never a
 * delivery, and a word that says it alone ("Done!", "Sent", "Terminé", "Bitti") counts only as
 * a short message of its own. A message that brings a file or a link is one whatever it says.
 */

/** Said anywhere in a message: the deed done, in so many words. */
const SAID: readonly RegExp[] = [
  /(?<!\p{L})(?:(?:i|we)(?:['’]ve| have)? (?:just |now |already )?(?:sent|finished|uploaded|shared|attached|submitted|signed|paid|transferred|done it)|(?:it|that|this|everything)(?:['’]s| is| has been) (?:now |all )?(?:done|sent|finished|uploaded|paid)|here it is|here you go|here you are|here['’]s the|see attached|please find attached|attached (?:is|are|you['’]ll find))(?!\p{L})/iu,
  /(?<!\p{L})و?(?:تم|تمّ|خلصت|خلّصت|خلصته|خلصتها|خلّصته|خلّصتها|بعتلك|بعتهولك|بعتهالك|بعتّه|أرسلت|ارسلت|أرسلته|أرسلتها|ارسلته|ارسلتها|رفعته|رفعتها|حوّلت|حولت|دفعت|هذا هو|ها هو|ها هي|هاي هي|مرفق|مرفقة|في المرفقات|بالمرفقات)(?!\p{L})/u,
  /(?<!\p{L})(?:c['’]est (?:fait|envoyé|réglé|bon)|(?:je |j['’]|on |nous )(?:vous |te |t['’]|l['’]|les |lui )*(?:ai|a|avons) (?:bien |déjà )?(?:envoyé|transmis|payé|viré|signé|terminé|fini|téléchargé)|voici (?:le|la|les)|ci-joint|ci-jointe?s?|en pièce jointe|en pj)(?!\p{L})/iu,
  /(?<!\p{L})(?:gönderdim|yolladım|ilettim|tamamlandı|tamamladım|bitirdim|hallettim|ödedim|yükledim|ekte|ekteki|ekledim|[İi]şte burada)(?!\p{L})/iu,
];
/** Said alone, as a short message of its own: "Done!", "Sent", "Voilà", "Tamamdır". */
const ALONE: readonly RegExp[] = [
  /(?<!\p{L})(?:done|all done|sent|finished|attached|uploaded)(?!\p{L})/iu,
  /(?<!\p{L})(?:خلصت|تم|اتبعت|اتبعتت|خلاص اتبعت)(?!\p{L})/u,
  /(?<!\p{L})(?:fait|envoyé|terminé|fini|voilà)(?!\p{L})/iu,
  /(?<!\p{L})(?:tamamdır|bitti|yaptım|gönderildi)(?!\p{L})/iu,
];
const ALONE_WORDS = 4;

/** Before it in its clause, what takes it back: not, not yet, still, will, when, if. */
const TAKEN_BACK: readonly RegExp[] = [
  /(?<!\p{L})(?:not|never|no|yet|still|will|going to|gonna|about to|once|when|if|after|well|what|how)(?!\p{L})|(?:n['’]t|['’]ll)(?!\p{L})/iu,
  /(?<!\p{L})(?:ما|مش|مو|لم|لن|لسه|لسا|لسّه|مازال|ما زال|لا|سوف|راح|رح|لما|لمّا|عندما|إذا|اذا|لو|بمجرد|أول ما)(?!\p{L})/u,
  /(?<!\p{L})(?:pas|plus|jamais|encore|quand|lorsque|si|vais|va|allons|dès|en|tout à)(?!\p{L})/iu,
  /(?<!\p{L})(?:henüz|değil|olunca|eğer|ne zaman)(?!\p{L})/iu,
];
/** After it in its clause, a time ahead: "done by Friday", "envoyé demain". */
const AHEAD =
  /(?<!\p{L})(?:by|until|tomorrow|later|tonight|soon|next|demain|ce soir|plus tard|bientôt|بكرة|بكره|غدا|غدًا|بعدين|yarın|akşam|sonra|birazdan)(?!\p{L})/iu;
/** A clause ends at a stop, a comma, a "but", a line. */
const CLAUSE = /[.!؟?،,;\n]|(?<!\p{L})(?:but|mais|ama|بس|لكن)(?!\p{L})/iu;

export function saysDelivered(
  text: string,
  brought: { files?: number; links?: number } = {},
): boolean {
  if ((brought.files ?? 0) > 0 || (brought.links ?? 0) > 0) return true;
  const words = text.trim();
  if (!words || words.length > 400) return false;
  // A question asks whether it's here; it doesn't say so.
  if (/[?؟]\s*$/.test(words)) return false;
  const short = words.split(/\s+/).length <= ALONE_WORDS;
  for (const said of short ? [...SAID, ...ALONE] : SAID) {
    const hit = said.exec(words);
    if (!hit) continue;
    const clause = words.slice(0, hit.index).split(CLAUSE).at(-1) ?? '';
    if (TAKEN_BACK.some((n) => n.test(clause))) continue;
    if (AHEAD.test(words.slice(hit.index + hit[0].length).split(CLAUSE)[0] ?? '')) continue;
    return true;
  }
  return false;
}
