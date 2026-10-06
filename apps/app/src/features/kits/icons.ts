import type { CardKitId } from '@caime/core/kit-cards';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import ChartBar from 'lucide-react-native/icons/chart-no-axes-column';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import FileCheck from 'lucide-react-native/icons/file-check';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import Images from 'lucide-react-native/icons/images';
import LifeBuoy from 'lucide-react-native/icons/life-buoy';
import ListChecks from 'lucide-react-native/icons/list-checks';
import MapPin from 'lucide-react-native/icons/map-pin';
import Package from 'lucide-react-native/icons/package';
import Receipt from 'lucide-react-native/icons/receipt';
import Truck from 'lucide-react-native/icons/truck';
import type { IconComponent } from '@/ui/Button';

/** Each kit's icon (the registry's Lucide names, mapped to the icons the bundle carries). */
export const KIT_ICONS: Record<CardKitId | 'poll' | 'location', IconComponent> = {
  approval: BadgeCheck,
  meeting: CalendarClock,
  document_review: FileCheck,
  order_status: Package,
  delivery: Truck,
  invoice: Receipt,
  purchase_order: ClipboardList,
  payment_request: HandCoins,
  support_ticket: LifeBuoy,
  appointment: CalendarCheck,
  checklist: ListChecks,
  shared_album: Images,
  split: HandCoins,
  poll: ChartBar,
  location: MapPin,
};

const BY_NAME: Record<string, IconComponent> = {
  'badge-check': BadgeCheck,
  'calendar-clock': CalendarClock,
  'file-check': FileCheck,
  package: Package,
  truck: Truck,
  receipt: Receipt,
  'clipboard-list': ClipboardList,
  'hand-coins': HandCoins,
  'life-buoy': LifeBuoy,
  'calendar-check': CalendarCheck,
  'list-checks': ListChecks,
  images: Images,
  'chart-bar': ChartBar,
  'map-pin': MapPin,
};

/** An organization's own card's icon, by the name its kit gives (core CUSTOM_KIT_ICONS). */
export const iconNamed = (name: string): IconComponent => BY_NAME[name] ?? ClipboardList;
