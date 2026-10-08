import { useEffect, useState } from 'react';

export type Readers = typeof import('./readers');

let loaded: Readers | null = null;
let loading: Promise<Readers> | null = null;

/** The readers, loaded once for the whole app; a failed load is tried again next time. */
export function loadReaders(): Promise<Readers> {
  loading ??= import('./readers').then(
    (m) => {
      loaded = m;
      return m;
    },
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

/**
 * The readers once they're here, asked for when a form that reads dates or amounts opens; null
 * for the moment before, when nothing typed is read yet.
 */
export function useReaders(): Readers | null {
  const [readers, setReaders] = useState(loaded);
  useEffect(() => {
    if (readers) return;
    let live = true;
    loadReaders().then(
      (m) => live && setReaders(m),
      (err: unknown) => console.warn('readers failed to load', err),
    );
    return () => {
      live = false;
    };
  }, [readers]);
  return readers;
}
