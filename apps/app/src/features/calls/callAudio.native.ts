/**
 * Where a call's sound goes on a phone, while it's on: a video call through the loudspeaker with
 * the screen kept on, a voice call at the ear with the screen off when it's held there (the
 * proximity sensor), as phone calls are; the Speaker button changes it. react-native-incall-manager
 * sets the phone's audio up for the call and puts it back after.
 */
import { useEffect, useState } from 'react';
import InCallManager from 'react-native-incall-manager';

export function useCallAudio(on: boolean, video: boolean) {
  const [speaker, setSpeaker] = useState(video);
  useEffect(() => {
    if (!on) return;
    InCallManager.start({ media: video ? 'video' : 'audio' });
    InCallManager.setForceSpeakerphoneOn(video);
    setSpeaker(video);
    return () => InCallManager.stop();
  }, [on, video]);
  return {
    speaker,
    toggleSpeaker: () => {
      const next = !speaker;
      InCallManager.setForceSpeakerphoneOn(next);
      setSpeaker(next);
    },
  };
}
