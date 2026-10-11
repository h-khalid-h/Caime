import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { JsonRpcResponse, McpServer } from './server';
import { serveStdio } from './stdio';

/** A server that answers after a delay named in the method, so order can be watched. */
function slowServer(): McpServer {
  const handle = async (message: unknown): Promise<JsonRpcResponse | null> => {
    const m = message as { id?: number; method: string };
    const wait = Number(/wait:(\d+)/.exec(m.method)?.[1] ?? 0);
    await new Promise((r) => setTimeout(r, wait));
    if (m.id === undefined) return null;
    return { jsonrpc: '2.0', id: m.id, result: { method: m.method } };
  };
  return { handle, handleText: (line) => handle(JSON.parse(line)) };
}

describe('the stdio transport', () => {
  it('reads one message a line, answers one a line, in the order asked, and nothing for a notification', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.on('data', (c: Buffer) => {
      written += c.toString();
    });
    const served = serveStdio(slowServer(), input, output);
    input.write('{"jsonrpc":"2.0","id":1,"method":"wait:30"}\n{"jsonrpc":"2.0","method":"note"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"meth');
    input.write('od":"wait:0"}\n\n');
    input.end('{"jsonrpc":"2.0","id":3,"method":"last"}');
    await served;
    expect(
      written
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    ).toEqual([
      { jsonrpc: '2.0', id: 1, result: { method: 'wait:30' } },
      { jsonrpc: '2.0', id: 2, result: { method: 'wait:0' } },
      { jsonrpc: '2.0', id: 3, result: { method: 'last' } },
    ]);
  });
});
