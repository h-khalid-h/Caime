import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
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
