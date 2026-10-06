import type { OrgSummaryView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { OrgKind } from '@caime/core/orgs';
import { Image } from 'expo-image';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Briefcase from 'lucide-react-native/icons/briefcase';
import Building from 'lucide-react-native/icons/building';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import HandHeart from 'lucide-react-native/icons/hand-heart';
import Landmark from 'lucide-react-native/icons/landmark';
import Stethoscope from 'lucide-react-native/icons/stethoscope';
import Store from 'lucide-react-native/icons/store';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
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

/**
 * An organization's mark: its logo, else its kind's icon on a quiet tile (no characters on
 * business, B2). A logo is on a rounded square, as an organization is not a person.
 */
export function OrgMark({
  kind,
  url,
  size = 46,
  testID,
}: {
  kind: OrgKind;
  /** Its logo, from the organization's view. */
  url?: string | null;
  size?: number;
  testID?: string;
}) {
  const t = useTheme();
  const Icon = ORG_ICONS[kind];
  const src = mediaUrl(url ?? null);
  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: t.c.surfaceMuted,
        borderWidth: 1,
        borderColor: t.c.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <Image
          source={{ uri: src, headers: mediaHeaders() }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={src}
          accessible={false}
        />
      ) : (
        <Icon size={size * 0.48} color={t.c.text} />
      )}
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
        {tr('Not verified yet')}
      </Text>
    );
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      accessibilityLabel={tr('Verified, {verifiedDomain}', { verifiedDomain: org.verifiedDomain })}
      testID="org-verified"
    >
      <BadgeCheck size={14} color={t.c.success} />
      <Text variant="captionStrong" color="success">
        {tr('Verified · {verifiedDomain}', { verifiedDomain: org.verifiedDomain })}
      </Text>
    </View>
  );
}
