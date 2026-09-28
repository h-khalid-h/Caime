import type { Sphere } from '@caime/core/taxonomy';
import type { IconComponent } from './Button';
import {
  BadgeCheck,
  Briefcase,
  Building,
  CircleDot,
  Globe,
  Hand,
  Handshake,
  Heart,
  Smile,
  Truck,
  Users,
  Wrench,
} from './icons';

const BY_NAME: Record<string, IconComponent> = {
  heart: Heart,
  'face-slightly-smiling': Smile,
  hand: Hand,
  briefcase: Briefcase,
  handshake: Handshake,
  truck: Truck,
  wrench: Wrench,
  'badge-check': BadgeCheck,
  users: Users,
  building: Building,
  globe: Globe,
  'circle-dot': CircleDot,
};

export function sphereIcon(name: string | undefined): IconComponent {
  return (name && BY_NAME[name]) || CircleDot;
}

export type { Sphere };
