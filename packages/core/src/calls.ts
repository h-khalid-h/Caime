/**
 * Calls (PRD §47): 1:1 voice and video in a direct conversation. The server rings, relays how
 * the two devices reach each other, and keeps the call's history; the media goes between them
 * directly, encrypted, and never through Caishy (unless a relay is set up, which can't read it).
 */

export const CALL_KINDS = ['voice', 'video'] as const;
export type CallKind = (typeof CALL_KINDS)[number];

export type CallState = 'ringing' | 'active' | 'ended';

/** How a call ended: answered and talked, nobody answered, turned down, called off, or dropped. */
export type CallOutcome = 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed';

/** How long a call rings before it's missed. */
export const CALL_RING_SECONDS = 45;

/** "under a minute", "4 min", "1 h 5 min": how long two people talked. */
export function callDuration(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/**
 * The line a call leaves in the conversation, for whoever reads it: "Video call · 4 min",
 * "Missed voice call" to the person who was called, "Voice call · no answer" to the caller.
 */
export function callText(
  kind: CallKind,
  outcome: CallOutcome,
  seconds: number,
  viewerCalled: boolean,
): string {
  const name = kind === 'video' ? 'Video call' : 'Voice call';
  switch (outcome) {
    case 'completed':
      return `${name} · ${callDuration(seconds)}`;
    case 'failed':
      return `${name} · couldn’t connect`;
    case 'declined':
      return viewerCalled ? `${name} · no answer` : `You declined a ${name.toLowerCase()}`;
    case 'cancelled':
      return viewerCalled ? `${name} · cancelled` : `Missed ${name.toLowerCase()}`;
    default:
      return viewerCalled ? `${name} · no answer` : `Missed ${name.toLowerCase()}`;
  }
}
