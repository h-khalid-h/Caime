/**
 * A part of a screen loaded the first time it's shown, never with the app: nothing while it
 * loads, and nothing if it can't be loaded (a deploy removed the file it was in, say), so the
 * screen around it stays. Shown again, it's tried again.
 */
import { Component, type ComponentType, lazy, type ReactNode, Suspense } from 'react';

class Quietly extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const make = () => lazy(async () => ({ default: await load() }));
  let Part = make();
  return function LazyPart(props: P) {
    return (
      <Quietly
        onFail={() => {
          Part = make();
        }}
      >
        <Suspense fallback={null}>
          <Part {...props} />
        </Suspense>
      </Quietly>
    );
  };
}
