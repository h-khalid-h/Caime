export const MIGRATIONS_DIR: string;
export const BIG_TABLES: string[];
export function statementsOf(text: string): { noTransaction: boolean; statements: string[] };
export function lintMigration(
  name: string,
  text: string,
  opts: { inProduction: (sha: string) => boolean },
): string[];
export function newMigrations(base: string): { added: string[]; changed: string[] };
export function lintRelease(base: string): {
  added: string[];
  changed: string[];
  problems: string[];
};
