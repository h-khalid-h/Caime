/**
 * The encryption private conversations use on the phones (R18): pure JavaScript, byte for byte
 * the browser's (`@caime/core/e2ee-noble`). The web build takes crypto.web.ts, the browser's Web
 * Crypto. Both export the same functions; what DeviceKeys holds is theirs alone, and only the
 * keystore beside each keeps it.
 *
 * In JavaScript each message opened takes tens of milliseconds, and a conversation opens many at
 * once. So here opening and sealing take turns, one at a time, each after the phone has had a
 * moment for anything else waiting (a tap, a scroll), and never in one long block.
 */
import * as noble from '@caime/core/e2ee-noble';

export * from '@caime/core/e2ee-noble';

let queue: Promise<unknown> = Promise.resolve();
/** After whatever is waiting to run (a macrotask: touches and frames go first). */
const aMoment = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function inTurn<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(aMoment).then(f);
  queue = run.catch(() => undefined);
  return run;
}

export const open: typeof noble.open = (input) => inTurn(() => noble.open(input));
export const seal: typeof noble.seal = (input) => inTurn(() => noble.seal(input));
