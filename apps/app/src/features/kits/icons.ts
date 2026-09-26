import type { CardKitId } from '@caishy/core/kit-cards';
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
  poll: ChartBar,
  location: MapPin,
};
