/**
 * Calls, as the rest of the app sees them. On phones they aren't built yet (PRD §47): these are
 * engine.ts's and group.ts's stand-ins. The web build uses calls.web.ts, which offers the same
 * names (calls.check.ts): the typecheck reads this file for both.
 */
export { callsSupported, checkLiveCall, onCallEvent, startCall } from './engine';
export {
  checkGroupCallIn,
  checkLiveGroupCall,
  groupCallsSupported,
  joinGroupCall,
  onGroupCallEvent,
  startGroupCall,
} from './group';
