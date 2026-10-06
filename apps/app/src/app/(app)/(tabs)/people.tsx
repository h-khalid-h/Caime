import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { PeopleList } from '@/features/shell/panes';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/layout';

export default function People() {
  const { desktop } = useLayout();
  if (desktop)
    return (
      <DetailPlaceholder
        character="zuzu"
        title={tr('Everyone you know, in the right place')}
        body={tr(
          'Pick someone to see how you know them, what’s open between you, and everything you’ve shared.',
        )}
        action={
          <Button
            label={tr('Connect with someone')}
            icon={UserPlus}
            onPress={() => router.push('/connect')}
          />
        }
      />
    );
  return <PeopleList />;
}
