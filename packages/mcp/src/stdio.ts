/**
 * The stdio transport: one JSON message a line in, one a line out, nothing else on stdout
 * (a log line goes to stderr, or the client reads it as a message). Answers go out in the
 * order the questions came, so a slow tool call never lets a later answer overtake it in a
 * client that reads them as a stream.
 */
import type { McpServer } from './server';

export function serveStdio(
  server: McpServer,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let pending = '';
    let chain: Promise<void> = Promise.resolve();
    const take = (line: string) => {
      const text = line.trim();
      if (!text) return;
      chain = chain.then(async () => {
        const answer = await server.handleText(text);
        if (answer) output.write(`${JSON.stringify(answer)}\n`);
      });
    };
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => {
      pending += chunk;
      let at = pending.indexOf('\n');
      while (at !== -1) {
        take(pending.slice(0, at));
        pending = pending.slice(at + 1);
        at = pending.indexOf('\n');
      }
    });
    input.on('end', () => {
      take(pending);
      pending = '';
      chain.then(resolve, reject);
    });
    input.on('error', reject);
  });
}
