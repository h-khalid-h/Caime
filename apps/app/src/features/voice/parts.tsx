/**
 * The two parts that bring the audio module, in one chunk: a module two lazy imports share
 * would move into `__common`, which loads first (CLAUDE.md), so both the player and the recorder
 * are taken from here, and the module is downloaded with the first voice note or recording.
 */
export { default as Recorder } from './Recorder';
export { default as VoiceNote } from './VoiceNote';
