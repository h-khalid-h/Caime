import { radii } from '@caime/brand/tokens';
import { notesAsked } from '@caime/core/calls';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import MessageSquareText from 'lucide-react-native/icons/message-square-text';
import Mic from 'lucide-react-native/icons/mic';
import MicOff from 'lucide-react-native/icons/mic-off';
import Phone from 'lucide-react-native/icons/phone';
import PhoneOff from 'lucide-react-native/icons/phone-off';
import ScreenShare from 'lucide-react-native/icons/screen-share';
import ScreenShareOff from 'lucide-react-native/icons/screen-share-off';
import Video from 'lucide-react-native/icons/video';
import VideoOff from 'lucide-react-native/icons/video-off';
import Volume2 from 'lucide-react-native/icons/volume-2';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCall } from '@/state/calls';
import { useSession } from '@/state/session';
import { Avatar } from '@/ui/Avatar';
import { Text } from '@/ui/Text';
import { ChatPeek, useCallChat } from './CallChat';
import { CallTile } from './CallTile';
import { useCallAudio } from './callAudio';
import {
  INK,
  Media,
  OVER_APP,
  OVER_VIDEO,
  Round,
  useElapsed,
  useFocusInside,
  useRingtone,
} from './callUi';
import {
  answer,
  hangUp,
  screenShareSupported,
  startSharing,
  stopSharing,
  toggleCamera,
  toggleMute,
} from './engine';
import { GroupCallLayer } from './GroupCallLayer';
import { CaiWritten, NotesAsk, NotesLine, NotesRound } from './NotesUi';
import { answerWithCai } from './notesWords';
import { ringAsk } from './ringWords';

/**
 * The call screen (PRD §47), over everything while a call rings or runs: who it's with, how
 * long it's been, and the three things you do in a call: mute, camera, hang up. Its chat is the
 * call's own conversation (R121): Chat makes the call small (`CallTile`) and opens it.
 */
function OneToOneCallLayer() {
  const me = useSession((s) => s.user?.id ?? '');
  // A meeting's guest has no conversation to write in (R84).
  const guest = useSession((s) => s.user?.kind === 'provisional');
  const { call, phase, local, remote, muted, cameraOff, sharing, theirs, note, shrunk, patch } =
    useCall();
  const chat = useCallChat(call?.conversationId ?? '', phase === 'active' && !guest);
  const elapsed = useElapsed(call?.answeredAt ?? null, phase === 'active');
  useRingtone(phase === 'incoming');
  // Clear of a phone's notch and home indicator (nothing on the web).
  const insets = useSafeAreaInsets();
  // A phone's sound, from when the two are connecting until the call is over.
  const audio = useCallAudio(
    phase === 'connecting' || phase === 'active' || phase === 'reconnecting',
    call?.kind === 'video',
  );
  // Keyboard and screen reader users land on what to do now: answer, or hang up.
  const primary = useRef<View>(null);
  useEffect(() => {
    if (!shrunk && (phase === 'incoming' || phase === 'outgoing' || phase === 'active'))
      (primary.current as unknown as HTMLElement | null)?.focus?.();
  }, [phase, shrunk]);
  const shown = Boolean(call && phase && phase !== 'starting');
  const root = useFocusInside(shown && !shrunk);
  const other = call ? (call.caller.id === me ? call.callee : call.caller) : null;
  // Who wrote what the peek shows: the other person, by name.
  const otherId = other?.id ?? '';
  const otherName = other?.displayName ?? '';
  const names = useMemo(() => new Map(otherId ? [[otherId, otherName]] : []), [otherId, otherName]);
  if (!call || !phase || phase === 'starting' || !other) return null;

  const openChat = () => {
    patch({ shrunk: true });
    router.navigate({ pathname: '/c/[id]', params: { id: call.conversationId } });
  };
  const video = call.kind === 'video';
  // Their screen when they share it; their camera in a video call, unless they turned it off.
  const theyShare = Boolean(theirs?.sharing);
  const seeThem =
    phase === 'active' &&
    Boolean(remote?.getVideoTracks().length) &&
    (theyShare || (video && theirs?.camera !== false));
  const status =
    phase === 'incoming'
      ? video
        ? tr('Video call')
        : tr('Voice call')
      : phase === 'outgoing'
        ? tr('Calling…')
        : phase === 'connecting'
          ? tr('Connecting…')
          : phase === 'reconnecting'
            ? tr('Reconnecting…')
            : phase === 'ended'
              ? (note ?? tr('Call ended'))
              : elapsed;

  const hasCamera = Boolean(local?.getVideoTracks().length);
  const called = video
    ? tr('Video call with {name}', { name: other.displayName })
    : tr('Voice call with {name}', { name: other.displayName });

  return (
    <>
      <View
        ref={root}
        role={phase === 'incoming' ? 'alertdialog' : 'dialog'}
        aria-modal
        aria-label={called}
        testID="call-screen"
        style={{
          ...OVER_APP,
          backgroundColor: INK,
          // Made small, it stays mounted out of sight: every voice keeps playing (R121).
          display: shrunk ? 'none' : 'flex',
        }}
      >
        {remote && phase !== 'ended' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Media
              stream={remote}
              video={seeThem}
              fit={theyShare ? 'contain' : 'cover'}
              testID="call-remote"
            />
          </View>
        ) : null}
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: seeThem ? 'flex-start' : 'center',
            paddingTop: (seeThem ? 24 : 0) + insets.top,
            gap: 10,
          }}
        >
          {seeThem ? null : (
            <Avatar id={other.id} name={other.displayName} url={other.avatarUrl} size={112} />
          )}
          <Text variant="title" style={{ color: '#FFFFFF', ...OVER_VIDEO }} numberOfLines={1}>
            {other.displayName}
          </Text>
          {phase === 'active' && (theyShare || theirs?.muted) ? (
            <Text
              variant="caption"
              style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
              testID="call-theirs"
            >
              {[
                theyShare
                  ? tr('{other} is sharing their screen', {
                      other: other.displayName.split(' ')[0],
                    })
                  : null,
                theirs?.muted ? tr('Muted') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <Text
            variant="body"
            style={{ color: '#FFFFFFDD', ...OVER_VIDEO }}
            // What's happening is said (calling, connecting, how it ended); the running clock isn't.
            aria-live={phase === 'active' ? 'off' : 'polite'}
            role={phase === 'active' ? 'timer' : undefined}
            testID="call-status"
          >
            {phase === 'incoming'
              ? // A customer's call to an organization rings its team as the organization's (M16 H8a).
                call.org && call.caller.id !== me
                ? tr('{status} · calling {orgName}', { status, orgName: call.org.name })
                : tr('{status} · calling you', { status })
              : status}
          </Text>
          {phase === 'active' || phase === 'outgoing' ? (
            <NotesLine notes={call.notes} me={me} />
          ) : null}
          {phase === 'incoming' && notesAsked(call.notes) ? (
            <Text
              variant="caption"
              align="center"
              style={{ color: '#FFFFFFDD', paddingHorizontal: 24, ...OVER_VIDEO }}
              testID="call-incoming-notes"
            >
              {ringAsk(call.notes, other.displayName.split(' ')[0] || other.displayName)}
            </Text>
          ) : null}
        </View>
        {phase === 'active' ? (
          <View style={{ position: 'absolute', bottom: 150 + insets.bottom, left: 0, right: 0 }}>
            <NotesAsk notes={call.notes} me={me} />
            <CaiWritten callId={call.id} />
            {guest ? null : (
              <ChatPeek
                row={chat}
                since={call.answeredAt ?? call.createdAt}
                names={names}
                onOpen={openChat}
              />
            )}
          </View>
        ) : null}
        {sharing && phase === 'active' ? (
          <View
            style={{
              position: 'absolute',
              bottom: 140 + insets.bottom,
              end: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: '#FFFFFF29',
            }}
            testID="call-you-share"
          >
            <Text variant="caption" style={{ color: '#FFFFFF' }}>
              {tr('You’re sharing your screen')}
            </Text>
          </View>
        ) : video &&
          local &&
          hasCamera &&
          !cameraOff &&
          phase !== 'incoming' &&
          phase !== 'ended' ? (
          <View
            style={{
              position: 'absolute',
              // Above the controls, clear of the name at the top on a narrow screen.
              bottom: 140 + insets.bottom,
              end: 16,
              width: 112,
              height: 156,
              borderRadius: radii.lg,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#FFFFFF33',
            }}
          >
            <Media stream={local} video mine testID="call-local" />
          </View>
        ) : null}
        {phase === 'ended' ? null : (
          <View
            style={{
              flexDirection: 'row',
              // Wrapped onto a second row where a phone is too narrow for every control: none
              // ever falls off an edge (R121's Chat made six).
              flexWrap: 'wrap',
              justifyContent: 'center',
              columnGap: 24,
              rowGap: 16,
              paddingHorizontal: 16,
              paddingBottom: 40 + insets.bottom,
              paddingTop: 16,
            }}
            testID={phase === 'incoming' ? 'call-incoming' : 'call-controls'}
          >
            {phase === 'incoming' ? (
              <>
                <Round
                  icon={PhoneOff}
                  label={tr('Decline')}
                  tone="end"
                  onPress={() => void hangUp()}
                  testID="call-decline"
                />
                {notesAsked(call.notes) ? (
                  // Asked to take notes: no plain Answer, each says what it does (R85 (1)).
                  <>
                    <Round
                      icon={video ? Video : Phone}
                      label={tr('Answer without Cai')}
                      tone="go"
                      onPress={() => void answer('no')}
                      testID="call-accept-without-notes"
                    />
                    <Round
                      icon={video ? Video : Phone}
                      label={answerWithCai(call.notes)}
                      tone="go"
                      onPress={() => void answer('yes')}
                      focusRef={primary}
                      testID="call-accept-with-notes"
                    />
                  </>
                ) : (
                  <Round
                    icon={video ? Video : Phone}
                    label={tr('Answer')}
                    tone="go"
                    onPress={() => void answer()}
                    focusRef={primary}
                    testID="call-accept"
                  />
                )}
              </>
            ) : (
              <>
                <Round
                  icon={muted ? MicOff : Mic}
                  label={muted ? tr('Unmute') : tr('Mute')}
                  on={muted}
                  onPress={toggleMute}
                  testID="call-mute"
                />
                {audio.speaker !== null ? (
                  <Round
                    icon={Volume2}
                    label={audio.speaker ? tr('Speaker off') : tr('Speaker')}
                    on={audio.speaker}
                    onPress={audio.toggleSpeaker}
                    testID="call-speaker"
                  />
                ) : null}
                {screenShareSupported && phase === 'active' ? (
                  <Round
                    icon={sharing ? ScreenShareOff : ScreenShare}
                    label={sharing ? tr('Stop sharing') : tr('Share screen')}
                    on={sharing}
                    onPress={() => void (sharing ? stopSharing() : startSharing())}
                    testID="call-share"
                  />
                ) : null}
                {video && hasCamera ? (
                  <Round
                    icon={cameraOff ? VideoOff : Video}
                    label={cameraOff ? tr('Camera on') : tr('Camera off')}
                    on={cameraOff}
                    onPress={toggleCamera}
                    testID="call-camera"
                  />
                ) : null}
                {(phase === 'active' || phase === 'outgoing') && !call.org ? (
                  // Asked while it rings, the ring itself asks (R85 (1): the caller's consent is
                  // starting with Cai). Not in a call with an organization yet (M16 H8a).
                  <NotesRound callId={call.id} notes={call.notes} testID="call-notes" />
                ) : null}
                {phase === 'active' && !guest ? (
                  <Round
                    icon={MessageSquareText}
                    label={tr('Chat')}
                    count={chat?.unreadCount ?? 0}
                    onPress={openChat}
                    testID="call-chat"
                  />
                ) : null}
                <Round
                  icon={PhoneOff}
                  label={phase === 'outgoing' ? tr('Cancel') : tr('Hang up')}
                  tone="end"
                  onPress={() => void hangUp()}
                  focusRef={primary}
                  testID="call-hangup"
                />
              </>
            )}
          </View>
        )}
      </View>
      {shrunk ? (
        <CallTile
          label={called}
          mark={<Avatar id={other.id} name={other.displayName} url={other.avatarUrl} size={32} />}
          title={other.displayName}
          status={status}
          over={phase === 'ended'}
          muted={muted}
          onMute={toggleMute}
          onBack={() => patch({ shrunk: false })}
          onEnd={() => void hangUp()}
          endLabel={tr('Hang up')}
        />
      ) : null}
    </>
  );
}

/**
 * The call screens: a 1:1 call's, and a group call's. One call at a time is ever on a device.
 * Loaded with the calls themselves when there's one to show (CallLayer.tsx).
 */
export function CallScreens() {
  return (
    <>
      <OneToOneCallLayer />
      <GroupCallLayer />
    </>
  );
}
