/**
 * Checks an environment file against the server's own configuration rules before it's deployed
 * (`pnpm --filter @caime/server check-env path/to/env`). A container whose configuration is
 * invalid exits at start, and with zero-downtime deploys the old one keeps answering, so the
 * host can report a deployment as done while nothing new runs (2026-10-14). It says which
 * variables fail and which are set twice, by name only: never a value.
 */
import { readFileSync } from 'node:fs';
import { loadConfig } from './config';

export function readEnvFile(text: string): { env: Record<string, string>; twice: string[] } {
  const env: Record<string, string> = {};
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const at = s.indexOf('=');
    if (at < 1) continue;
    const name = s.slice(0, at).trim();
    let value = s.slice(at + 1);
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'"))
      value = value.slice(1, -1);
    if (seen.has(name)) twice.add(name);
    seen.add(name);
    // As the container gets it: the last line for a name wins.
    env[name] = value;
  }
  return { env, twice: [...twice].sort() };
}

/** The names that fail, from the configuration's error (its messages can quote values). */
export function failingNames(env: Record<string, string>): string[] {
  try {
    loadConfig({ NODE_ENV: 'production', ...env });
    return [];
  } catch (e) {
    return String((e as Error).message)
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(':')[0] ?? '')
      .filter(Boolean);
  }
}

if (process.argv[1]?.endsWith('check-env.ts')) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: pnpm --filter @caime/server check-env <env file>');
    process.exit(2);
  }
  const { env, twice } = readEnvFile(readFileSync(file, 'utf8'));
  const failing = failingNames(env);
  if (twice.length) console.log(`Set more than once (the last wins): ${twice.join(', ')}`);
  if (failing.length) {
    console.log(`Invalid, so the server won't start: ${failing.join(', ')}`);
    process.exit(1);
  }
  console.log('Valid: the server will start with this configuration.');
}
