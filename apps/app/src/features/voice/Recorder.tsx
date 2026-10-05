import { formatDuration } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { LocalFile } from '@/api/upload';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Mic, Square, Trash } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** The longest voice note: the server transcribes up to this, and a longer one is a recording. */
export const VOICE_MAX_MS = 10 * 60_000;

export interface Recorded extends LocalFile {
  durationMs: number;
}

/**
 * Recording a voice note in the composer (PRD §46): starts on open, stops on the square, sends on
 * the arrow or is thrown away. One file on every platform through expo-audio (webm/opus in a
 * browser, m4a on a phone); the server sniffs the kind and keeps the length the recorder measured.
 */
export default function Recorder({
  onDone,
  onCancel,
}: {
  onDone: (file: Recorded) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'asking' | 'recording' | 'stopped' | 'denied'>('asking');
  const startedAt = useRef<number | null>(null);
  const [lengthMs, setLengthMs] = useState(0);

  // The callbacks as the latest render gave them, so the effects below run once each.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const stopRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    let limit: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const permission = await requestRecordingPermissionsAsync().catch(() => ({
        granted: false,
      }));
      if (cancelled) return;
      if (!permission.granted) {
        setPhase('denied');
        return;
      }
      try {
        if (Platform.OS !== 'web')
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        startedAt.current = Date.now();
        setPhase('recording');
        // A note stops itself at the longest a note can be.
        limit = setTimeout(() => void stopRef.current(), VOICE_MAX_MS);
      } catch (e) {
        if (!cancelled) {
          toast((e as Error).message || tr('Recording didn’t start'), { tone: 'danger' });
          onCancelRef.current();
        }
      }
    })();
    return () => {
      cancelled = true;
      if (limit) clearTimeout(limit);
    };
  }, [recorder]);

  const stop = async () => {
    if (phase !== 'recording') return;
    const ms = startedAt.current ? Date.now() - startedAt.current : state.durationMillis;
    setLengthMs(Math.max(1000, Math.min(ms, VOICE_MAX_MS)));
    try {
      await recorder.stop();
      setPhase('stopped');
    } catch (e) {
      toast((e as Error).message || tr('Recording didn’t stop'), { tone: 'danger' });
      onCancel();
    }
  };
  stopRef.current = stop;

  const send = () => {
    const uri = recorder.uri;
    if (!uri) {
      onCancel();
      return;
    }
    const web = Platform.OS === 'web';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    onDone({
      uri,
      name: `voice-${stamp}.${web ? 'webm' : 'm4a'}`,
      mime: web ? 'audio/webm' : 'audio/mp4',
      durationMs: lengthMs,
    });
  };

  const discard = async () => {
    if (phase === 'recording') await recorder.stop().catch(() => {});
    onCancel();
  };

  if (phase === 'denied')
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}
        testID="voice-recorder"
      >
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {tr('Caime can’t use the microphone. Allow it in your browser or phone settings.')}
        </Text>
        <Button label={tr('Close')} size="sm" variant="ghost" onPress={onCancel} />
      </View>
    );

  const shown = phase === 'stopped' ? lengthMs : state.durationMillis;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 6,
        paddingVertical: 6,
      }}
      testID="voice-recorder"
    >
      <IconButton
        icon={Trash}
        label={tr('Discard the recording')}
        onPress={() => void discard()}
        testID="voice-discard"
      />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: phase === 'recording' ? t.c.danger : t.c.textTertiary,
          }}
        />
        <Text variant="body" testID="voice-elapsed">
          {phase === 'asking' ? tr('Starting…') : formatDuration(shown)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {phase === 'recording' ? tr('Recording') : phase === 'stopped' ? tr('Ready to send') : ''}
        </Text>
      </View>
      {phase === 'recording' ? (
        <IconButton
          icon={Square}
          label={tr('Stop recording')}
          filled
          onPress={() => void stop()}
          testID="voice-stop"
        />
      ) : phase === 'stopped' ? (
        <Button label={tr('Send')} size="sm" onPress={send} testID="voice-send" />
      ) : (
        <Mic size={18} color={t.c.textTertiary} />
      )}
    </View>
  );
}
