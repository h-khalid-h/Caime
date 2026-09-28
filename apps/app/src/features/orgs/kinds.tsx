import type { OrgSummaryView } from '@caime/core/api';
import type { OrgKind } from '@caime/core/orgs';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import {
  BadgeCheck,
  Briefcase,
  Building,
  GraduationCap,
  HandHeart,
  Landmark,
  Stethoscope,
  Store,
} from '@/ui/icons';
import { Text } from '@/ui/Text';

export const ORG_ICONS: Record<OrgKind, IconComponent> = {
  business: Briefcase,
  shop: Store,
  clinic: Stethoscope,
  school: GraduationCap,
  nonprofit: HandHeart,
  public_service: Landmark,
  other: Building,
};

/** An organization's mark: its kind's icon on a quiet tile (no characters on business, B2). */
export function OrgMark({ kind, size = 46 }: { kind: OrgKind; size?: number }) {
  const t = useTheme();
  const Icon = ORG_ICONS[kind];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: t.c.surfaceMuted,
        borderWidth: 1,
        borderColor: t.c.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size * 0.48} color={t.c.text} />
    </View>
  );
}

/** What Caime knows about who this is, said in words (PRD §54). */
export function VerifiedLine({
  org,
}: {
  org: Pick<OrgSummaryView, 'verified' | 'verifiedDomain'>;
}) {
  const t = useTheme();
  if (!org.verified)
    return (
      <Text variant="caption" color="textSecondary" testID="org-unverified">
        Not verified yet
      </Text>
    );
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      accessibilityLabel={`Verified, ${org.verifiedDomain}`}
      testID="org-verified"
    >
      <BadgeCheck size={14} color={t.c.success} />
      <Text variant="captionStrong" color="success">
        Verified · {org.verifiedDomain}
      </Text>
    </View>
  );
}
