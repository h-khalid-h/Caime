/**
 * What a form reads in typed words: a day and time ("Friday 3pm", "vendredi 15h", "cuma 3'te",
 * "الجمعة الساعة 3"), an amount ("EGP 500"), and the card a message being written could be
 * (M17 I9a). Loaded only through `useReaders` and
 * `loadReaders` (`readers.test.ts` fails on a static import of these): they know every interface
 * language's dates, which no first screen needs.
 */
export { extractAmounts } from '@caime/core/amounts';
export { cardOfferIn } from '@caime/core/card-offer';
export { firstFutureWhen, parseWhen } from '@caime/core/when';
