import type { Sphere } from '@caime/core/taxonomy';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Building from 'lucide-react-native/icons/building';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import Smile from 'lucide-react-native/icons/face-slightly-smiling';
import Globe from 'lucide-react-native/icons/globe';
import Hand from 'lucide-react-native/icons/hand';
import Handshake from 'lucide-react-native/icons/handshake';
import Heart from 'lucide-react-native/icons/heart';
import Truck from 'lucide-react-native/icons/truck';
import Users from 'lucide-react-native/icons/users';
import Wrench from 'lucide-react-native/icons/wrench';
import type { IconComponent } from './Button';

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
