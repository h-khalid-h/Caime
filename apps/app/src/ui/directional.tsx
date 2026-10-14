import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CornerUpLeft from 'lucide-react-native/icons/corner-up-left';
import ForwardIcon from 'lucide-react-native/icons/forward';
import LogOut from 'lucide-react-native/icons/log-out';
import PanelRight from 'lucide-react-native/icons/panel-right';
import ReplyIcon from 'lucide-react-native/icons/reply';
import SendHorizontal from 'lucide-react-native/icons/send-horizontal';
import { View } from 'react-native';
import { useRtl } from '@/lib/direction';
import type { IconComponent } from './Button';

/**
 * The icons that point somewhere (R73): Back points to where someone came from, a chevron to
 * where a row leads, which is the other way round in a layout that runs right to left. Each is
 * one lucide icon imported from its own file, mirrored by the layout's direction, so a screen
 * imports `Back` or `Chevron` from here rather than the arrow itself. The mirror is a View's
 * (react-native-svg on the web applies a transform of the icon's own twice, once as CSS on the
 * svg and once inside it, which flipped the arrow out of its viewport).
 */
function mirrored(rtl: boolean, icon: React.ReactElement) {
  if (!rtl) return icon;
  return <View style={{ transform: [{ scaleX: -1 }] }}>{icon}</View>;
}

export const Back: IconComponent = (props) => mirrored(useRtl(), <ArrowLeft {...props} />);

export const Chevron: IconComponent = (props) => mirrored(useRtl(), <ChevronRight {...props} />);

/** The chevron the other way: the previous one of several (a photo, a page). */
export const ChevronBack: IconComponent = (props) => mirrored(useRtl(), <ChevronLeft {...props} />);

// The rest that point (review 2026-10-09): sending goes the way the words run, a reply or a
// forward curves back or on, the details panel sits at the end, and leaving walks out that way.
export const Send: IconComponent = (props) => mirrored(useRtl(), <SendHorizontal {...props} />);
export const Reply: IconComponent = (props) => mirrored(useRtl(), <ReplyIcon {...props} />);
export const ReplyArrow: IconComponent = (props) => mirrored(useRtl(), <CornerUpLeft {...props} />);
export const Forward: IconComponent = (props) => mirrored(useRtl(), <ForwardIcon {...props} />);
export const Panel: IconComponent = (props) => mirrored(useRtl(), <PanelRight {...props} />);
export const Leave: IconComponent = (props) => mirrored(useRtl(), <LogOut {...props} />);
