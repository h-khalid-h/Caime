import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure logic (cache edits, shortcuts' ordering); screens are covered
// end to end in e2e/.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
