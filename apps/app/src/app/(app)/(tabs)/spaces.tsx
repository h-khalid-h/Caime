import { router } from 'expo-router';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { SpacesList } from '@/features/shell/panes';
import { Button } from '@/ui/Button';
import { LayoutGrid, Plus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';

export default function Spaces() {
  const { desktop } = useLayout();
  if (desktop)
    return (
      <DetailPlaceholder
        character="lumi"
        icon={LayoutGrid}
        title="A place for each group"
        body="Pick a space to see its conversations and its people, or start one for a family, a team, a project or a club."
        action={
          <Button label="Start a space" icon={Plus} onPress={() => router.push('/new-space')} />
        }
      />
    );
  return <SpacesList />;
}
