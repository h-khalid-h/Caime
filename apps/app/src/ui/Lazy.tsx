/**
 * A part of a screen loaded the first time it's shown, never with the app: nothing while it
 * loads, and nothing if it can't be loaded (a deploy removed the file it was in, say), so the
 * screen around it stays. Shown again, it's tried again. A part that is the whole screen (a tab,
 * a pane) says so when it can't be shown instead, with a way to try again: never a blank page.
 */
import { Component, type ComponentType, lazy, type ReactNode, Suspense } from 'react';
import { Platform } from 'react-native';

/** What a part that's a whole screen shows when it can't be: the route's own error screen. */
export type PartFailed = ComponentType<{ error: Error; retry: () => Promise<void> }>;

class Quietly extends Component<
  {
    /** Made as it's shown, so that tried again it's the part made afresh. */
    part: () => ReactNode;
    onFail: () => void;
    failed?: (error: Error, retry: () => void) => ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.part();
    return this.props.failed?.(error, () => this.setState({ error: null })) ?? null;
  }
}

export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
  Failed?: PartFailed,
): ComponentType<P> {
  // Its file couldn't be fetched: on the web, one a deploy replaced is found by loading afresh.
  let unfetched = false;
  const make = () =>
    lazy(async () => {
      try {
        return { default: await load() };
      } catch (e) {
        unfetched = true;
        throw e;
      }
    });
  let Part = make();
  return function LazyPart(props: P) {
    return (
      <Quietly
        part={() => (
          <Suspense fallback={null}>
            <Part {...props} />
          </Suspense>
        )}
        onFail={() => {
          Part = make();
        }}
        failed={
          Failed
            ? (error, retry) => (
                <Failed
                  error={error}
                  retry={async () => {
                    if (unfetched && Platform.OS === 'web') window.location.reload();
                    else retry();
                  }}
                />
              )
            : undefined
        }
      />
    );
  };
}
