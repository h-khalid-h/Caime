/**
 * The call on this device (PRD §47), for the call screen to draw. The WebRTC work lives in
 * features/calls/engine; this is only what it tells the screen.
 */
import type { CallView } from '@caime/core/api';
import { create } from 'zustand';

export type CallPhase =
  /** Asking for the microphone and camera, then ringing the other person. */
  | 'starting'
  | 'outgoing'
  | 'incoming'
  /** Answered: the two devices are finding each other. */
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended';

/** What the other device says it's doing, peer to peer (null until it has said). */
export interface TheirState {
  camera: boolean;
  sharing: boolean;
  muted: boolean;
}

interface CallStore {
  call: CallView | null;
  phase: CallPhase | null;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  /** This device is showing its screen instead of its camera. */
  sharing: boolean;
  theirs: TheirState | null;
  /** Why it ended, when there's something to say. */
  note: string | null;
  patch: (p: Partial<Omit<CallStore, 'patch' | 'reset'>>) => void;
  reset: () => void;
}

const idle = {
  call: null,
  phase: null,
  local: null,
  remote: null,
  muted: false,
  cameraOff: false,
  sharing: false,
  theirs: null,
  note: null,
};

export const useCall = create<CallStore>((set) => ({
  ...idle,
  patch: (p) => set(p),
  reset: () => set(idle),
}));

/** This tab or app: a call rings every device, and runs on the one that answered. */
export const DEVICE_ID = `dev-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
