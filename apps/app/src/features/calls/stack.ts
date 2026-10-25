/**
 * Everything of calls, loaded as one piece the first time it's needed
 * (load.ts): both engines and their screens. One piece, so none of it is shared with the
 * app's start and loaded with it.
 */

export { CallScreens } from './CallScreens';
export * from './engine';
export * from './group';
export { answerNotes, askNotes, onNotesEvent, stopNotes } from './notes';
export { onCaiEvent } from './voice';

// The call's recording (R114, M17 I13b) follows the call stores from when the calls load.
import './recording';
