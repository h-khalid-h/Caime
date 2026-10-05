import { tr } from '@caime/core/i18n';
import { InboxList } from '@/features/inbox/InboxList';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { useLayout } from '@/ui/layout';

export default function Chats() {
  const { desktop } = useLayout();
  if (desktop)
    return (
      <DetailPlaceholder
        character="caishy"
        title={tr('Pick a conversation')}
        body={tr('Whatever needs you is at the top of the list. Everything else can wait.')}
      />
    );
  return <InboxList />;
}
