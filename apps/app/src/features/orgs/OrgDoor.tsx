/**
 * An organization's door (R53): the link a customer opens to write to it, and its QR code, for
 * the team to put on the door, the receipt and the bio. Opened by someone new, the link signs
 * them up and lands them in the conversation; by a customer, it opens it.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import Download from 'lucide-react-native/icons/download';
import Share from 'lucide-react-native/icons/share';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { isWeb } from '@/lib/config';
import { shareLink } from '@/lib/share';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CopyRow } from '@/ui/CopyRow';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const QUIET = 4;

/** The code as a file: the same path, a quiet zone, black on white, eight pixels a module. */
function svgFile(size: number, path: string): string {
  const side = size + QUIET * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side * 8}" height="${side * 8}" viewBox="${-QUIET} ${-QUIET} ${side} ${side}" shape-rendering="crispEdges">` +
    `<rect x="${-QUIET}" y="${-QUIET}" width="${side}" height="${side}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`
  );
}

function saveSvg(name: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OrgDoor({ org }: { org: OrgView }) {
  const t = useTheme();
  const door = useQuery({ queryKey: qk.orgDoor(org.id), queryFn: () => endpoints.orgDoor(org.id) });
  const d = door.data;
  const side = d ? d.qr.size + QUIET * 2 : 0;
  return (
    <View testID="org-door">
      <Card>
        <Text variant="bodyStrong">{tr('Your door')}</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4, marginBottom: 12 }}>
          {tr(
            'Put this link, or its code, on the door, the receipt and the bio. Whoever opens it writes to {name} in Caime: someone new signs up and lands in the conversation, a customer opens theirs.',
            { name: org.name },
          )}
        </Text>
        {d ? (
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
            {/* Always black on white, whatever the theme: a code is for a camera, not a reader. */}
            <View
              style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}
              accessibilityRole="image"
              accessibilityLabel={tr('QR code of {name}’s link', { name: org.name })}
              testID="org-door-qr"
            >
              <Svg width={128} height={128} viewBox={`${-QUIET} ${-QUIET} ${side} ${side}`}>
                <Rect x={-QUIET} y={-QUIET} width={side} height={side} fill="#fff" />
                <Path d={d.qr.path} fill="#000" />
              </Svg>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <CopyRow label={tr('Link')} value={d.url} testID="org-door-link" />
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {isWeb ? (
                  <Button
                    label={tr('Save the code')}
                    icon={Download}
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      saveSvg(`${org.handle}-caime`, svgFile(d.qr.size, d.qr.path));
                      toast(tr('Saved as an SVG: it prints sharp at any size.'));
                    }}
                    testID="org-door-save"
                  />
                ) : null}
                <Button
                  label={tr('Share')}
                  icon={Share}
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    void shareLink(tr('Write to {name} on Caime:', { name: org.name }), d.url)
                  }
                  testID="org-door-share"
                />
              </View>
            </View>
          </View>
        ) : (
          <Text variant="caption" color={door.isError ? 'danger' : 'textTertiary'}>
            {door.isError ? tr('Couldn’t load the link. Try again.') : tr('Loading…')}
          </Text>
        )}
        <View style={{ height: 1, backgroundColor: t.c.border, marginVertical: 12 }} />
        <Text variant="caption" color="textSecondary">
          {org.verified
            ? tr('Customers see “Verified”: {name} proved it controls {domain}.', {
                name: org.name,
                domain: org.verifiedDomain,
              })
            : tr(
                'Verify your domain below, and customers who open it see “Verified” before they write.',
              )}
        </Text>
      </Card>
    </View>
  );
}
