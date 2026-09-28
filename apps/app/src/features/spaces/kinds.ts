import type { SpaceKind } from '@caime/core/spaces';
import type { IconComponent } from '@/ui/Button';
import { Briefcase, GraduationCap, Heart, House, Shapes, Target, Users } from '@/ui/icons';

export const SPACE_ICONS: Record<SpaceKind, IconComponent> = {
  family: House,
  friends: Heart,
  team: Briefcase,
  project: Target,
  community: Users,
  school: GraduationCap,
  other: Shapes,
};
