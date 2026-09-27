import { router } from 'expo-router';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { PeopleList } from '@/features/shell/panes';
import { Button } from '@/ui/Button';
import { UserPlus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';

export default function People() {
  const { desktop } = useLayout();
  if (desktop)
    return (
      <DetailPlaceholder
        character="zuzu"
        title="Everyone you know, in the right place"
        body="Pick someone to see how you know them, what’s open between you, and everything you’ve shared."
        action={
          <Button
            label="Connect with someone"
            icon={UserPlus}
            onPress={() => router.push('/connect')}
          />
        }
      />
    );
  return <PeopleList />;
}
