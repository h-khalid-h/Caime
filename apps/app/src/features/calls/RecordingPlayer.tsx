import type { CallRecordingPartView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import Play from 'lucide-react-native/icons/play';
import { openFile } from '@/lib/openFile';
import { Button } from '@/ui/Button';

/**
 * A part of a call's recording on a phone (M17 I13b): fetched with the session once and played
 * by the phone's own player, as a video in a message is (R88).
 */
export default function RecordingPlayer({
  part,
}: {
  part: Pick<CallRecordingPartView, 'id' | 'kind' | 'url' | 'mime'> & { url: string };
  width: number;
}) {
  return (
    <Button
      label={part.kind === 'screen' ? tr('Play the screen') : tr('Play the voices')}
      icon={Play}
      size="sm"
      variant="secondary"
      onPress={() =>
        void openFile({
          id: part.id,
          url: part.url,
          mime: part.mime,
          name: part.kind === 'screen' ? 'screen.mp4' : 'call.mp4',
        })
      }
      testID={`call-recording-${part.kind}`}
    />
  );
}
