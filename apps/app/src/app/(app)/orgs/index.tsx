import { ORG_ROLE_LABELS, orgKindName } from '@caime/core/orgs';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useOrgs } from '@/api/hooks';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Plus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

/** The organizations you're on the team of (PRD §36). */
export default function Organizations() {
  const t = useTheme();
  const me = useMe();
  const { desktop } = useLayout();
  const q = useOrgs();
  const orgs = q.data?.orgs ?? [];
  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={
          desktop ? undefined : (
            <IconButton
              icon={ArrowLeft}
              label="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
            />
          )
        }
        title="Organizations"
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Text variant="body" color="textSecondary">
          A business, a clinic, a school or a nonprofit on Caime: a profile people can trust once
          you verify your domain, and a team that answers together.
        </Text>
        {q.isPending && !q.data ? (
          <SkeletonRows />
        ) : (
          orgs.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`${o.name}, ${o.myRole ? ORG_ROLE_LABELS[o.myRole] : ''}`}
              onPress={() =>
                router.navigate({ pathname: '/o/[handle]', params: { handle: o.handle } })
              }
              testID={`org-row-${o.handle}`}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: t.c.border,
                backgroundColor: hovered ? t.c.surfaceHover : t.c.surface,
              })}
            >
              <OrgMark kind={o.kind} url={o.avatarUrl} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1} auto>
                  {o.name}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {[o.myRole ? ORG_ROLE_LABELS[o.myRole] : null, orgKindName(o.kind)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <VerifiedLine org={o} />
              </View>
            </Pressable>
          ))
        )}
        {me.minor ? (
          <Text variant="caption" color="textSecondary">
            Organizations are for people over 18.
          </Text>
        ) : (
          <Button
            label="Create an organization"
            icon={Plus}
            variant={orgs.length ? 'secondary' : 'primary'}
            onPress={() => router.push('/orgs/new')}
            testID="org-create-start"
          />
        )}
      </ScrollView>
    </Screen>
  );
}
