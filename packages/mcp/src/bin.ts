/**
 * `caime-mcp`: the server a client such as Claude Desktop or Claude Code starts, with
 * CAIME_TOKEN (a personal access token from Settings · Developer, or a bridge's) and, for
 * another Caime, CAIME_BASE_URL. Nothing is written to stdout but protocol messages.
 */
import { Caime } from '@caime/sdk';
import { createServer } from './server';
import { serveStdio } from './stdio';

const VERSION = '0.1.0';

async function main(
  env: NodeJS.ProcessEnv = process.env,
  io: {
    stdin: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  } = process,
): Promise<number> {
  const token = env.CAIME_TOKEN?.trim();
  if (!token) {
    io.stderr.write(
      'caime-mcp: set CAIME_TOKEN to a personal access token (Caime → Settings → Developer).\n',
    );
    return 2;
  }
  const client = new Caime({
    token,
    ...(env.CAIME_BASE_URL ? { baseUrl: env.CAIME_BASE_URL } : {}),
    userAgent: `caime-mcp/${VERSION}`,
  });
  await serveStdio(createServer({ client, version: VERSION }), io.stdin, io.stdout);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`caime-mcp: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
