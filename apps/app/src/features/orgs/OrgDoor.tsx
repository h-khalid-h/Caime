/**
 * An organization's door (R53): the link a customer opens to write to it, and its QR code, for
 * the team to put on the door, the receipt and the bio. Opened by someone new, the link signs
 * them up and lands them in the conversation; by a customer, it opens it. Once its domain is
 * verified, the one line that puts the door on its own website (R117, M17 I17a).
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

/** A link and its code, side by side: the code to print, the link to copy, save or share. */
function LinkCode({
  url,
  qr,
  label,
  file,
  shareText,
  testID,
}: {
  url: string;
  qr: { size: number; path: string };
  /** What a screen reader says the code is. */
  label: string;
  file: string;
  shareText: string;
  testID: string;
}) {
  const side = qr.size + QUIET * 2;
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      {/* Always black on white, whatever the theme: a code is for a camera, not a reader. */}
      <View
        style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        testID={`${testID}-qr`}
      >
        <Svg width={128} height={128} viewBox={`${-QUIET} ${-QUIET} ${side} ${side}`}>
          <Rect x={-QUIET} y={-QUIET} width={side} height={side} fill="#fff" />
          <Path d={qr.path} fill="#000" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <CopyRow label={tr('Link')} value={url} testID={`${testID}-link`} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {isWeb ? (
            <Button
              label={tr('Save the code')}
              icon={Download}
              size="sm"
              variant="secondary"
              onPress={() => {
                saveSvg(file, svgFile(qr.size, qr.path));
                toast(tr('Saved as an SVG: it prints sharp at any size.'));
              }}
              testID={`${testID}-save`}
            />
          ) : null}
          <Button
            label={tr('Share')}
            icon={Share}
            size="sm"
            variant="secondary"
            onPress={() => void shareLink(shareText, url)}
            testID={`${testID}-share`}
          />
        </View>
      </View>
    </View>
  );
}

export function OrgDoor({ org }: { org: OrgView }) {
  const t = useTheme();
  const door = useQuery({ queryKey: qk.orgDoor(org.id), queryFn: () => endpoints.orgDoor(org.id) });
  const d = door.data;
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
          <View style={{ gap: 16 }}>
            <LinkCode
              url={d.url}
              qr={d.qr}
              label={tr('QR code of {name}’s link', { name: org.name })}
              file={`${org.handle}-caime`}
              shareText={tr('Write to {name} on Caime:', { name: org.name })}
              testID="org-door"
            />
            {d.book ? (
              <View style={{ gap: 8 }} testID="org-door-book">
                <Text variant="bodyStrong">{tr('Book online')}</Text>
                <Text variant="caption" color="textSecondary">
                  {tr(
                    'Beside it, the way to book: whoever opens this picks a time, with an account or without one, and the booking lands in your inbox.',
                  )}
                </Text>
                <LinkCode
                  url={d.book.url}
                  qr={d.book.qr}
                  label={tr('QR code for booking with {name}', { name: org.name })}
                  file={`${org.handle}-book-caime`}
                  shareText={tr('Book with {name} on Caime:', { name: org.name })}
                  testID="org-door-book"
                />
              </View>
            ) : null}
            <View style={{ gap: 8 }} testID="org-door-widget">
              <Text variant="bodyStrong">{tr('On your website')}</Text>
              {d.widget ? (
                <>
                  <Text variant="caption" color="textSecondary">
                    {tr(
                      'Paste this into your website where the box should be: visitors write to you or book a time in it, and it lands in your inbox. Only pages at {domain} can show it.',
                      { domain: d.widget.domain },
                    )}
                  </Text>
                  <CopyRow
                    label={tr('Code for your website')}
                    value={d.widget.snippet}
                    testID="org-door-widget-code"
                  />
                </>
              ) : (
                <Text variant="caption" color="textSecondary">
                  {tr(
                    'Verify your domain below, and you can put a box on your website where visitors write to you or book a time.',
                  )}
                </Text>
              )}
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
