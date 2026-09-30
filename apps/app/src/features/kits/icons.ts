import type { CardKitId } from '@caime/core/kit-cards';
import type { IconComponent } from '@/ui/Button';
import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  ChartBar,
  ClipboardList,
  FileCheck,
  HandCoins,
  Images,
  LifeBuoy,
  ListChecks,
  MapPin,
  Package,
  Receipt,
  Truck,
} from '@/ui/icons';

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
