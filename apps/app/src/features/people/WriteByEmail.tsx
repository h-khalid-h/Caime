/**
 * Writing to an address that isn't on Caime yet (R93): when what's typed is an email address and
 * nobody findable by it showed, one row offers the one-to-one with it, by mail from the person's
 * own Caime address. The server decides what the address is; the row never guesses.
 */
import { addressValue } from '@caime/core/addresses';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import Mail from 'lucide-react-native/icons/mail';
import { useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { useMe } from '@/state/session';
import { ListRow } from '@/ui/ListRow';
import { toast } from '@/ui/Toast';

export function WriteByEmail({ typed, name }: { typed: string; name?: string }) {
  const me = useMe();
  const address = me.mailAddress && !me.minor ? addressValue('email', typed) : null;
  const [busy, setBusy] = useState(false);
  const write = async () => {
    if (busy || !address) return;
    setBusy(true);
    try {
      const { conversation } = await endpoints.conversationByEmail(address, name);
      router.navigate({ pathname: '/c/[id]', params: { id: conversation.id } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  // Not an address, or not one this person can write to by mail: nothing to offer.
  if (!address) return null;
  return (
    <ListRow
      icon={Mail}
      title={tr('Write to {address} by email', { address })}
      subtitle={tr('It goes from your Caime address. Their reply comes back here.')}
      onPress={() => void write()}
      testID="write-by-email"
    />
  );
}
