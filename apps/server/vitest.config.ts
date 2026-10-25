import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // A hang fails fast here; on CI a starved runner ran every file 3.5x slower (2026-10-25,
    // twice on one commit) and two flows of a second each ran past twenty, so there a test has
    // a minute: a real hang still fails, a slow runner doesn't.
    testTimeout: process.env.CI ? 60_000 : 20_000,
    hookTimeout: process.env.CI ? 60_000 : 30_000,
    pool: 'forks',
  },
});
