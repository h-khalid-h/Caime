/**
 * What a browser keeps for itself, by key: its own storage, as AsyncStorage's web build kept it,
 * without the library, whose `mergeItem` and `merge-options` were 3 KB of the first download for
 * nothing the app calls (startup chunk, M16 G9). A storage the browser refuses rejects, as
 * AsyncStorage's did; nothing reads it before a window exists.
 */
const local = () => window.localStorage;

const kv = {
  getItem: (key: string): Promise<string | null> =>
    new Promise((done) => done(local().getItem(key))),
  setItem: (key: string, value: string): Promise<void> =>
    new Promise((done) => done(local().setItem(key, value))),
  removeItem: (key: string): Promise<void> => new Promise((done) => done(local().removeItem(key))),
};

export default kv;
