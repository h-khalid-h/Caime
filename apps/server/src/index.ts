import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp(config);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, draining`);
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: config.HOST });
