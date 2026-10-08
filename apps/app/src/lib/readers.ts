/**
 * What a form reads in typed words: a day and time ("Friday 3pm", "vendredi 15h", "cuma 3'te",
 * "الجمعة الساعة 3") and an amount ("EGP 500"). Loaded only through `useReaders` and
 * `loadReaders` (`readers.test.ts` fails on a static import of these): they know every interface
 * language's dates, which no first screen needs.
 */
export { extractAmounts } from '@caime/core/amounts';
export { firstFutureWhen, parseWhen } from '@caime/core/when';
