/**
 * The app on a phone with Expo Go, against the live Caime (https://caime.datac.com, or
 * CAIME_API_URL): the Expo dev server, whose QR code the phone's camera opens in Expo Go. The
 * phone and this computer on the same Wi-Fi; add --tunnel when they can't be.
 *
 *   pnpm dev:phone
 *
 * Calls aren't in Expo Go (they need react-native-webrtc's native code: a development build);
 * everything else is, private conversations included.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../apps/app', import.meta.url));
const api = process.env.CAIME_API_URL ?? 'https://caime.datac.com';
const child = spawn('npx', ['expo', 'start', '--go', ...process.argv.slice(2)], {
  cwd: app,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_PUBLIC_API_URL: api },
});
child.on('exit', (code) => process.exit(code ?? 0));
