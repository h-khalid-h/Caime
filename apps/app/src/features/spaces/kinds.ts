import type { SpaceKind } from '@caime/core/spaces';
import Briefcase from 'lucide-react-native/icons/briefcase';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import Heart from 'lucide-react-native/icons/heart';
import House from 'lucide-react-native/icons/house';
import Shapes from 'lucide-react-native/icons/shapes';
import Target from 'lucide-react-native/icons/target';
import Users from 'lucide-react-native/icons/users';
import type { IconComponent } from '@/ui/Button';

export const SPACE_ICONS: Record<SpaceKind, IconComponent> = {
  family: House,
  friends: Heart,
  team: Briefcase,
  project: Target,
  community: Users,
  school: GraduationCap,
  other: Shapes,
};
