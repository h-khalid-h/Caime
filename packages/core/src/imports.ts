/**
 * How much one chat import takes (R45). Apart from the reader (`whatsapp.ts`) so the request
 * schemas can hold the same numbers without carrying the reader into every screen's bundle.
 */

/** The most messages one import takes: a decade of daily chat, and a body the server will read. */
export const IMPORT_MAX_MESSAGES = 20_000;
/** A message longer than this is cut where WhatsApp itself would have (its limit is 65,536). */
export const IMPORT_MAX_TEXT = 10_000;
