/**
 * Saying something was done that nobody did: confirmed, booked, cancelled, refunded. Read in
 * every interface language whatever the case's, since an answer may slip into another; what it
 * will be once someone acts ("once it's confirmed", "dès qu'il sera confirmé", "onaylandığında")
 * is no claim, nor is what it isn't yet ("it isn't confirmed yet", "لسه ما اتأكدش").
 */
const CLAIMS: readonly RegExp[] = [
  /\b(?:is|are|was|were|has been|have been)\s+(?:now\s+|all\s+)?(?:confirmed|booked|cancell?ed|refunded|approved)\b/gi,
  /\b(?:it|that|this|everything)['’]s\s+(?:now\s+|all\s+)?(?:confirmed|booked)\b/gi,
  /\byou['’]re\s+(?:now\s+|all\s+)?(?:confirmed|booked)\b/gi,
  /\bI['’]ve\s+(?:confirmed|booked|cancell?ed|refunded|approved)\b/gi,
  /\b(?:refund|discount)\s+(?:is|has been)\s+(?:issued|applied|approved|done)\b/gi,
  /(?<!\p{L})تم\s+(?:تأكيد|التأكيد|الحجز|حجز|إلغاء|الإلغاء|استرداد|الاسترداد|رد\s+المبلغ|تطبيق\s+الخصم)/gu,
  /(?<!\p{L})(?:الحجز|حجزك|الموعد|موعدك)\s+(?:أصبح\s+|بقى\s+|صار\s+)?(?:مؤكد|مؤكّد|اتأكد|اتأكّد|تأكد|تأكّد)(?!\p{L})/gu,
  /(?<!\p{L})(?:أكدت|أكّدت|حجزت)\s+(?:لك|لكم|ليك|الحجز|الموعد|موعدك|حجزك)(?!\p{L})/gu,
  /(?<!\p{L})(?:est|sont|a été|ont été)\s+(?:bien\s+|maintenant\s+)?(?:confirmée?s?|réservée?s?|annulée?s?|remboursée?s?)(?!\p{L})/giu,
  /(?<!\p{L})c['’]est\s+(?:bien\s+|maintenant\s+)?(?:confirmé|réservé)(?!\p{L})/giu,
  /(?<!\p{L})j['’]ai\s+(?:bien\s+)?(?:confirmé|réservé|annulé|remboursé)(?!\p{L})/giu,
  /(?<!\p{L})(?:onaylandı|onaylanmıştır|kesinleşti|kesinleşmiştir|iade edildi|iptal edildi|onayladım|ayırdım)(?!\p{L})/giu,
];
/** Just before a claim, what makes it a future one: "once", "عند", "dès que", and two words more. */
const ONCE =
  /(?<!\p{L})(?:once|when|after|until|till|if|as soon as|عند|بعد|حين|عندما|لما|بمجرد|أول ما|dès que|dès qu['’]|une fois que|quand|lorsque|lorsqu['’]|si)\s+(?:\S+\s+){0,2}$/iu;

/** Whether `text` says something was confirmed or done that only the team could have done. */
export function claimsDone(text: string): boolean {
  for (const claim of CLAIMS)
    for (const m of text.matchAll(claim))
      if (!ONCE.test(text.slice(Math.max(0, m.index - 40), m.index))) return true;
  return false;
}
