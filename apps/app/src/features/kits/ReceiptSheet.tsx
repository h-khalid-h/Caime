/**
 * A paid Pay card's receipt (R62, R65), loaded when asked for: its lines as a spec sheet, shared
 * as words, and printed on the web (a printer or a PDF) with the rest of the page left out.
 */
import { tr } from '@caime/core/i18n';
import { receiptLines, receiptText } from '@caime/core/receipts';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { isWeb } from '@/lib/config';
import { shareLink } from '@/lib/share';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';

/** On paper, the receipt alone: everything else on the page is hidden while it prints. */
const PRINT_CSS =
  '@media print{body *{visibility:hidden!important}#caime-receipt,#caime-receipt *{visibility:visible!important}#caime-receipt{position:fixed;inset:0;padding:24px}}';

export function ReceiptSheet({
  messageId,
  open,
  onClose,
}: {
  messageId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { timeZone, locale } = useUserClock();
  const receipt = useQuery({
    queryKey: qk.receipt(messageId),
    queryFn: () => endpoints.receipt(messageId),
    enabled: open,
    select: (d) => d.receipt,
  });
  useEffect(() => {
    if (!isWeb || !open || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, [open]);
  const clock = { now: new Date(), timeZone, locale };
  const r = receipt.data;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Receipt')}
      subtitle={tr('A record of a payment both sides agreed on. Caime holds no money.')}
      footer={
        r ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isWeb ? (
              <Button
                label={tr('Print')}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => window.print()}
                testID="receipt-print"
              />
            ) : null}
            <Button
              label={tr('Share')}
              style={{ flex: 1 }}
              onPress={() => void shareLink(receiptText(r, clock))}
              testID="receipt-share"
            />
          </View>
        ) : null
      }
    >
      {r ? (
        <View nativeID="caime-receipt" style={{ gap: 12 }} testID="receipt">
          <Spec
            rows={receiptLines(r, clock).map((l) => ({
              label: l.label,
              value: l.value,
              testID: `receipt-${l.key}`,
            }))}
          />
        </View>
      ) : receipt.error ? (
        <Text color="danger">{(receipt.error as Error).message}</Text>
      ) : (
        <SkeletonRows count={5} />
      )}
    </Sheet>
  );
}
